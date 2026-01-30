"""
Redis Configuration Module
Centralizes Redis connection handling for the OhmGuard backend.
Designed to fail gracefully - application continues working if Redis is unavailable.
"""
import os
import logging
from typing import Optional
import redis
from redis.exceptions import ConnectionError, TimeoutError, RedisError

logger = logging.getLogger(__name__)

# Global client instance and availability flag
_redis_client: Optional[redis.Redis] = None
_redis_available: bool = True  # Assume available until proven otherwise
_redis_init_attempted: bool = False


def _get_redis_config():
    """
    Get Redis configuration from environment variables.
    Called at runtime to ensure production env vars are loaded.
    """
    return {
        "host": os.environ.get("REDIS_HOST", "localhost"),
        "port": int(os.environ.get("REDIS_PORT", "6379")),
        "password": os.environ.get("REDIS_PASSWORD", None),
        "db": int(os.environ.get("REDIS_DB", "0")),
        "ssl": os.environ.get("REDIS_SSL", "false").lower() == "true",
        "max_connections": int(os.environ.get("REDIS_MAX_CONNECTIONS", "10")),
        "socket_timeout": int(os.environ.get("REDIS_SOCKET_TIMEOUT", "5")),
        "socket_connect_timeout": int(os.environ.get("REDIS_SOCKET_CONNECT_TIMEOUT", "5")),
    }


def get_redis_client() -> Optional[redis.Redis]:
    """
    Get or create a Redis client instance.
    Uses a connection pool for efficient connection management.
    
    Returns:
        redis.Redis: Connected Redis client instance, or None if unavailable
    """
    global _redis_client, _redis_available, _redis_init_attempted
    
    # Get config at runtime
    config = _get_redis_config()
    
    # If we already know Redis is unavailable, return None immediately
    if not _redis_available and _redis_init_attempted:
        return None
    
    if _redis_client is not None:
        # Verify connection is still alive
        try:
            _redis_client.ping()
            return _redis_client
        except Exception:
            # Connection lost, reset and try to reconnect
            _redis_client = None
    
    _redis_init_attempted = True
    logger.info(f"Initializing Redis connection to {config['host']}:{config['port']} (DB: {config['db']}, SSL: {config['ssl']})")
    
    try:
        # Create connection pool with appropriate settings
        pool_kwargs = {
            "host": config["host"],
            "port": config["port"],
            "db": config["db"],
            "max_connections": config["max_connections"],
            "socket_timeout": config["socket_timeout"],
            "socket_connect_timeout": config["socket_connect_timeout"],
            "decode_responses": True,  # Return strings instead of bytes
            "retry_on_timeout": True,
        }
        
        # Only add password if provided and not empty
        if config["password"] and config["password"].strip():
            pool_kwargs["password"] = config["password"]
        
        # Only add SSL if enabled
        if config["ssl"]:
            import ssl
            pool_kwargs["ssl"] = True
            pool_kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        
        pool = redis.ConnectionPool(**pool_kwargs)
        _redis_client = redis.Redis(connection_pool=pool)
        
        # Test connection
        _redis_client.ping()
        _redis_available = True
        logger.info("Redis connection established successfully")
        
        return _redis_client
        
    except (ConnectionError, TimeoutError, RedisError, OSError) as e:
        logger.warning(f"Redis unavailable (non-blocking): {e}")
        _redis_available = False
        _redis_client = None
        return None
    except Exception as e:
        logger.warning(f"Redis initialization failed (non-blocking): {e}")
        _redis_available = False
        _redis_client = None
        return None


def is_redis_available() -> bool:
    """Check if Redis is currently available."""
    global _redis_available
    return _redis_available


def reset_redis_connection():
    """Reset Redis connection state to allow reconnection attempts."""
    global _redis_client, _redis_available, _redis_init_attempted
    _redis_client = None
    _redis_available = True
    _redis_init_attempted = False


def close_redis_client():
    """
    Close the Redis client connection and release resources.
    Should be called during application shutdown.
    """
    global _redis_client, _redis_available
    
    if _redis_client is not None:
        try:
            _redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")
        finally:
            _redis_client = None


def check_redis_health() -> dict:
    """
    Check Redis connection health and return status information.
    Non-blocking - returns status info even if Redis is unavailable.
    
    Returns:
        dict: Health check result with status, latency, and connection info
    """
    # Get config at runtime
    config = _get_redis_config()
    
    try:
        client = get_redis_client()
        
        if client is None:
            return {
                "status": "unavailable",
                "connected": False,
                "host": config["host"],
                "port": config["port"],
                "db": config["db"],
                "ssl": config["ssl"],
                "message": "Redis connection not available - cache disabled"
            }
        
        # Measure ping latency
        import time
        start = time.time()
        client.ping()
        latency_ms = (time.time() - start) * 1000
        
        # Get server info
        try:
            info = client.info("server")
            redis_version = info.get("redis_version", "unknown")
            uptime = info.get("uptime_in_seconds", 0)
        except Exception:
            redis_version = "unknown"
            uptime = 0
        
        return {
            "status": "healthy",
            "connected": True,
            "host": config["host"],
            "port": config["port"],
            "db": config["db"],
            "ssl": config["ssl"],
            "latency_ms": round(latency_ms, 2),
            "redis_version": redis_version,
            "uptime_seconds": uptime
        }
        
    except (ConnectionError, TimeoutError, RedisError) as e:
        return {
            "status": "unhealthy",
            "connected": False,
            "host": config["host"],
            "port": config["port"],
            "db": config["db"],
            "ssl": config["ssl"],
            "error": str(e)
        }
    except Exception as e:
        return {
            "status": "error",
            "connected": False,
            "host": config["host"],
            "port": config["port"],
            "error": str(e)
        }


# Async wrapper for use with FastAPI (optional)
async def get_redis_client_async() -> Optional[redis.Redis]:
    """
    Async wrapper for get_redis_client().
    Note: This uses the synchronous redis client.
    For fully async operations, consider using redis.asyncio.Redis.
    """
    return get_redis_client()
