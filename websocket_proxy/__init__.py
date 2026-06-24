# websocket_proxy/__init__.py

import logging
from importlib import import_module

from .base_adapter import (
    BaseBrokerWebSocketAdapter,
    ENABLE_CONNECTION_POOLING,
    MAX_SYMBOLS_PER_WEBSOCKET,
    MAX_WEBSOCKET_CONNECTIONS,
)
from .broker_factory import (
    cleanup_all_pools,
    create_broker_adapter,
    get_pool_stats,
    get_resource_health,
    register_adapter,
)
from .connection_manager import (
    ConnectionPool,
    SharedZmqPublisher,
    get_max_symbols_per_websocket,
    get_max_websocket_connections,
)
from .server import WebSocketProxy
from .server import main as websocket_main

# Set up logger
logger = logging.getLogger(__name__)

_BROKER_ADAPTERS = {
    "angel": ("broker.angel.streaming.angel_adapter", "AngelWebSocketAdapter"),
    "definedge": ("broker.definedge.streaming.definedge_adapter", "DefinedgeWebSocketAdapter"),
    "dhan": ("broker.dhan.streaming.dhan_adapter", "DhanWebSocketAdapter"),
    "dhan_sandbox": ("broker.dhan_sandbox.streaming.dhan_adapter", "DhanWebSocketAdapter"),
    "groww": ("broker.groww.streaming.groww_adapter", "GrowwWebSocketAdapter"),
    "kotak": ("broker.kotak.streaming.kotak_adapter", "KotakWebSocketAdapter"),
    "zerodha": ("broker.zerodha.streaming.zerodha_adapter", "ZerodhaWebSocketAdapter"),
}


def _register_available_adapters():
    for broker_name, (module_name, class_name) in _BROKER_ADAPTERS.items():
        try:
            module = import_module(module_name)
            adapter_class = getattr(module, class_name)
        except (ImportError, AttributeError) as exc:
            logger.debug("Skipping unavailable %s websocket adapter: %s", broker_name, exc)
            continue
        register_adapter(broker_name, adapter_class)


_register_available_adapters()

__all__ = [
    # Core classes
    "WebSocketProxy",
    "websocket_main",
    "register_adapter",
    "create_broker_adapter",
    # Base adapter (for cleanup utilities)
    "BaseBrokerWebSocketAdapter",
    # Connection pooling (multi-websocket support)
    "ConnectionPool",
    "SharedZmqPublisher",
    "get_pool_stats",
    "get_resource_health",
    "cleanup_all_pools",
    "get_max_symbols_per_websocket",
    "get_max_websocket_connections",
    # Configuration constants
    "MAX_SYMBOLS_PER_WEBSOCKET",
    "MAX_WEBSOCKET_CONNECTIONS",
    "ENABLE_CONNECTION_POOLING",
    # Broker adapters
    "AngelWebSocketAdapter",
    "ZerodhaWebSocketAdapter",
    "DhanWebSocketAdapter",
    "FlattradeWebSocketAdapter",
    "ShoonyaWebSocketAdapter",
    "TradeSmartWebSocketAdapter",
    "IbullsWebSocketAdapter",
    "CompositedgeWebSocketAdapter",
    "FivepaisaWebSocketAdapter",
    "FivepaisaXTSWebSocketAdapter",
    "IiflWebSocketAdapter",
    "IiflcapitalWebSocketAdapter",
    "JainamWebSocketAdapter",
    "TrustlineWebSocketAdapter",
    "WisdomWebSocketAdapter",
    "UpstoxWebSocketAdapter",
    "KotakWebSocketAdapter",
    "FyersWebSocketAdapter",
    "DefinedgeWebSocketAdapter",
    "PaytmWebSocketAdapter",
    "IndmoneyWebSocketAdapter",
    "MstockWebSocketAdapter",
    "MotilalWebSocketAdapter",
    "JainamXTSWebSocketAdapter",
    "SamcoWebSocketAdapter",
    "PocketfulWebSocketAdapter",
    "NubraWebSocketAdapter",
    "RMoneyWebSocketAdapter",
    "ArrowWebSocketAdapter",
]
