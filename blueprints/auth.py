import base64
import importlib
import io
import os
import re

import qrcode
from flask import Blueprint, jsonify, redirect, request, session
from flask_wtf.csrf import generate_csrf

from database import auth_db
from database.auth_db import (
    get_active_sessions,
    get_api_key_for_tradingview,
    remove_session,
    update_session_last_seen,
)
from database.user_db import authenticate_user, find_user_by_exact_username, find_user_by_username
import utils.auth_utils as auth_utils
from utils.auth_utils import validate_password_strength
from utils.ip_helper import get_real_ip
from utils.logging import get_logger
from utils.session import is_session_valid, revoke_user_tokens

logger = get_logger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _json_error(message, status_code=400):
    return jsonify({"status": "error", "message": message}), status_code


def _request_value(name, default=""):
    data = request.get_json(silent=True) if request.is_json else None
    if data and name in data:
        return data.get(name) or default
    return request.form.get(name, default)


def _clear_expired_broker_session():
    if session.get("logged_in") and not is_session_valid():
        try:
            revoke_user_tokens()
        finally:
            session.clear()


def _complete_local_login(username):
    session.clear()
    session["authenticated"] = True
    session["user"] = username
    session["user_session_key"] = username
    return jsonify({"status": "success", "message": "Login successful"}), 200


def _is_successful_funds_response(response):
    if response is None:
        return False
    if isinstance(response, dict):
        status = str(response.get("status", "")).lower()
        message = str(response.get("message", "")).lower()
        if status in {"error", "failed", "failure"}:
            return False
        if any(term in message for term in ("expired", "invalid", "unauthorized")):
            return False
    return True


def _try_resume_broker_session(username):
    auth_record = auth_db.get_auth_token_dbquery(username)
    if not auth_record or auth_record.is_revoked:
        return None

    broker = auth_record.broker
    auth_token = auth_db.decrypt_token(auth_record.auth)
    if not broker or not auth_token:
        return None

    try:
        funds_module = importlib.import_module(f"broker.{broker}.api.funds")
        if hasattr(funds_module, "test_auth_token"):
            ok, error = funds_module.test_auth_token(auth_token)
            if not ok:
                logger.info("Stored broker token failed validation for %s: %s", username, error)
                return None
        elif hasattr(funds_module, "get_margin_data"):
            funds_response = funds_module.get_margin_data(auth_token)
            if not _is_successful_funds_response(funds_response):
                logger.info("Stored broker token returned an invalid funds response for %s", username)
                return None
    except Exception:
        logger.exception("Failed to validate stored broker token for %s", username)
        return None

    feed_token = auth_db.decrypt_token(auth_record.feed_token) if auth_record.feed_token else None
    auth_utils.handle_auth_success(
        auth_token=auth_token,
        user_session_key=username,
        broker=broker,
        feed_token=feed_token,
        user_id=auth_record.user_id,
    )
    try:
        auth_db.log_login_attempt(
            username=username,
            ip_address=get_real_ip(),
            device_info=request.headers.get("User-Agent", ""),
            status="resumed",
            login_type="resume",
            broker=broker,
        )
    except Exception:
        logger.exception("Failed to log resumed login for %s", username)

    return jsonify({"status": "success", "message": "Broker session resumed", "broker": broker}), 200


def _configured_broker_name():
    redirect_url = os.getenv("REDIRECT_URL", "")
    match = re.search(r"/([^/]+)/callback/?$", redirect_url)
    return match.group(1) if match else ""


def _session_username():
    return session.get("user_session_key") or session.get("user")


@auth_bp.route("/check-setup")
def check_setup():
    return jsonify({"needs_setup": find_user_by_username() is None})


@auth_bp.route("/csrf-token")
def csrf_token():
    return jsonify({"csrf_token": generate_csrf()})


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    _clear_expired_broker_session()

    if request.method == "GET":
        return redirect("/login")

    if find_user_by_username() is None:
        return jsonify({"status": "error", "message": "Initial setup is required", "redirect": "/setup"}), 400

    username = str(_request_value("username")).strip()
    password = _request_value("password")

    if not username or not password:
        return _json_error("Username and password are required")

    if not authenticate_user(username, password):
        logger.warning("Failed login attempt for user: %s", username)
        auth_db.log_login_attempt(
            username=username,
            ip_address=get_real_ip(),
            device_info=request.headers.get("User-Agent", ""),
            status="failed",
            login_type="password",
            failure_reason="invalid_password",
        )
        return _json_error("Invalid username or password", 401)

    user = find_user_by_exact_username(username)
    if user and user.is_totp_required_for("login"):
        session["pending_totp_username"] = username
        return jsonify({"status": "totp_required", "message": "TOTP required"})

    auth_db.log_login_attempt(
        username=username,
        ip_address=get_real_ip(),
        device_info=request.headers.get("User-Agent", ""),
        status="success",
        login_type="password",
    )
    resumed = _try_resume_broker_session(username)
    if resumed:
        return resumed

    return _complete_local_login(username)


@auth_bp.route("/login/totp", methods=["POST"])
def login_totp():
    username = session.get("pending_totp_username")
    if not username:
        return _json_error("TOTP login session expired. Please sign in again.", 401)

    data = request.get_json(silent=True) or {}
    totp_code = (data.get("totp_code") or "").strip()
    user = find_user_by_exact_username(username)
    if not user or not user.verify_totp(totp_code):
        auth_db.log_login_attempt(
            username=username,
            ip_address=get_real_ip(),
            device_info=request.headers.get("User-Agent", ""),
            status="failed",
            login_type="password",
            failure_reason="invalid_totp",
        )
        return _json_error("Invalid TOTP code", 401)

    session.pop("pending_totp_username", None)
    auth_db.log_login_attempt(
        username=username,
        ip_address=get_real_ip(),
        device_info=request.headers.get("User-Agent", ""),
        status="success",
        login_type="password",
    )
    resumed = _try_resume_broker_session(username)
    if resumed:
        return resumed

    return _complete_local_login(username)


@auth_bp.route("/broker")
def broker_login():
    return redirect("/broker")


@auth_bp.route("/broker-config")
def broker_config():
    broker_name = _configured_broker_name()
    if not broker_name:
        return _json_error("REDIRECT_URL is not configured with a broker callback path", 500)

    return jsonify(
        {
            "status": "success",
            "broker_name": broker_name,
            "broker_api_key": os.getenv("BROKER_API_KEY", ""),
            "redirect_url": os.getenv("REDIRECT_URL", ""),
        }
    )


@auth_bp.route("/session")
def session_info():
    username = _session_username()
    if session.get("session_id"):
        update_session_last_seen(session["session_id"])
    return jsonify(
        {
            "status": "success",
            "authenticated": bool(session.get("authenticated") or username),
            "logged_in": bool(session.get("logged_in") and username and session.get("broker")),
            "user": username,
            "broker": session.get("broker"),
        }
    )


@auth_bp.route("/session-status")
def session_status():
    username = _session_username()
    if session.get("session_id"):
        update_session_last_seen(session["session_id"])
    logged_in = bool(session.get("logged_in") and username and session.get("broker"))
    authenticated = bool(session.get("authenticated") or logged_in or username)

    response = {
        "status": "success",
        "authenticated": authenticated,
        "logged_in": logged_in,
        "user": username,
        "broker": session.get("broker") if logged_in else None,
        "api_key": get_api_key_for_tradingview(username) if username else None,
        "active_sessions": 0,
    }

    if username:
        try:
            response["active_sessions"] = len(get_active_sessions(username))
        except Exception:
            logger.exception("Failed to load active session count")

    return jsonify(response)


@auth_bp.route("/profile")
def profile():
    username = _session_username()
    user = find_user_by_exact_username(username)
    if not user:
        return _json_error("Login required", 401)

    qr = qrcode.QRCode(version=1, box_size=8, border=4)
    qr.add_data(user.get_totp_uri())
    qr.make(fit=True)
    image_buffer = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(image_buffer, format="PNG")

    return jsonify(
        {
            "status": "success",
            "username": user.username,
            "email": user.email,
            "qr_code": base64.b64encode(image_buffer.getvalue()).decode("ascii"),
        }
    )


@auth_bp.route("/2fa/status")
def two_factor_status():
    username = _session_username()
    user = find_user_by_exact_username(username)
    if not user:
        return _json_error("Login required", 401)
    return jsonify(
        {
            "status": "success",
            "totp_enabled": bool(user.totp_enabled),
            "totp_required_for_login": bool(user.totp_required_for_login),
            "totp_required_for_mcp": bool(user.totp_required_for_mcp),
            "totp_required_for_password_reset": bool(user.totp_required_for_password_reset),
            "last_totp_verified_at": session.get("last_totp_verified_at"),
        }
    )


@auth_bp.route("/2fa/configure", methods=["POST"])
def configure_two_factor():
    username = _session_username()
    user = find_user_by_exact_username(username)
    if not user:
        return _json_error("Login required", 401)

    data = request.get_json(silent=True) or {}
    totp_code = str(data.get("totp_code", "")).strip()
    if not user.verify_totp(totp_code):
        return _json_error("Invalid TOTP code", 401)

    user.totp_enabled = bool(data.get("totp_enabled"))
    user.totp_required_for_login = bool(data.get("totp_required_for_login"))
    user.totp_required_for_mcp = bool(data.get("totp_required_for_mcp"))
    user.totp_required_for_password_reset = bool(data.get("totp_required_for_password_reset"))

    from database.user_db import db_session

    db_session.commit()
    from datetime import datetime

    session["last_totp_verified_at"] = datetime.utcnow().isoformat() + "Z"
    return jsonify({"status": "success", "message": "2FA settings updated"})


@auth_bp.route("/change-password", methods=["POST"])
def change_password():
    username = _session_username()
    user = find_user_by_exact_username(username)
    if not user:
        return _json_error("Login required", 401)

    current_password = _request_value("current_password")
    new_password = _request_value("new_password")
    confirm_password = _request_value("confirm_password", new_password)

    if not current_password or not new_password:
        return _json_error("Current password and new password are required")
    if new_password != confirm_password:
        return _json_error("New password and confirmation do not match")
    if not user.check_password(current_password):
        return _json_error("Current password is incorrect", 401)

    is_valid, error_message = validate_password_strength(new_password)
    if not is_valid:
        return _json_error(error_message)

    user.set_password(new_password)
    from database.user_db import db_session, username_cache

    username_cache.pop(f"user-{username}", None)
    db_session.commit()
    logger.info("Password changed for user: %s", username)
    return jsonify({"status": "success", "message": "Password changed successfully"})


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    return _json_error("Password reset is not enabled. Sign in and use Change Password.", 501)


@auth_bp.route("/logout", methods=["GET", "POST"])
def logout():
    session_id = session.get("session_id")
    try:
        revoke_user_tokens(revoke_db_tokens=False)
    except Exception:
        logger.exception("Error while revoking local session on logout")
    if session_id:
        remove_session(session_id)
    session.clear()
    if request.method == "POST" or request.is_json:
        return jsonify({"status": "success", "redirect": "/login"})
    return redirect("/login")
