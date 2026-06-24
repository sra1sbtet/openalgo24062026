# blueprints/settings.py

from flask import Blueprint, jsonify, request

from database.settings_db import set_analyze_mode
from utils.logging import get_logger
from utils.session import check_session_validity

logger = get_logger(__name__)

settings_bp = Blueprint("settings_bp", __name__, url_prefix="/settings")


@settings_bp.route("/analyze-mode")
@check_session_validity
def get_mode():
    """Get current analyze mode setting"""
    return jsonify({"analyze_mode": False})


@settings_bp.route("/analyze-mode/<int:mode>", methods=["POST"])
@check_session_validity
def set_mode(mode):
    """Set analyze mode setting and manage execution engine thread"""
    try:
        if mode:
            return jsonify({"error": "Analyze mode is disabled in this lean build"}), 400

        set_analyze_mode(False)

        return jsonify(
            {
                "success": True,
                "analyze_mode": False,
                "message": "Switched to Live Mode",
            }
        )
    except Exception as e:
        logger.exception(f"Error setting analyze mode: {str(e)}")
        return jsonify({"error": "Failed to set analyze mode"}), 500
