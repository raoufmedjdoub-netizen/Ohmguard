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

# Redis configuration from environment variables
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", None)
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))
REDIS_SSL = os.environ.get("REDIS_SSL", "false").lower() == "true"

# Connection pool settings
REDIS_MAX_CONNECTIONS = int(os.environ.get("REDIS_MAX_CONNECTIONS", "10"))
REDIS_SOCKET_TIMEOUT = int(os.environ.get("REDIS_SOCKET_TIMEOUT", "5"))
REDIS_SOCKET_CONNECT_TIMEOUT = int(os.environ.get("REDIS_SOCKET_CONNECT_TIMEOUT", "5"))

# Global client instance and availability flag
_redis_client: Optional[redis.Redis] = None
_redis_available: bool = True  # Assume available until proven otherwise
_redis_init_attempted: bool = False


def get_redis_client() -> Optional[redis.Redis]:
    """
    Get or create a Redis client instance.
    Uses a connection pool for efficient connection management.
    
    Returns:
        redis.Redis: Connected Redis client instance, or None if unavailable
    """
    global _redis_client, _redis_available, _redis_init_attempted
    
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
    logger.info(f"Initializing Redis connection to {REDIS_HOST}:{REDIS_PORT} (DB: {REDIS_DB}, SSL: {REDIS_SSL})")
    
    try:
        # Create connection pool with appropriate settings
        pool_kwargs = {
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB,
            "max_connections": REDIS_MAX_CONNECTIONS,
            "socket_timeout": REDIS_SOCKET_TIMEOUT,
            "socket_connect_timeout": REDIS_SOCKET_CONNECT_TIMEOUT,
            "decode_responses": True,  # Return strings instead of bytes
            "retry_on_timeout": True,
        }
        
        # Only add password if provided and not empty
        if REDIS_PASSWORD and REDIS_PASSWORD.strip():
            pool_kwargs["password"] = REDIS_PASSWORD
        
        # Only add SSL if enabled
        if REDIS_SSL:
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
    try:
        client = get_redis_client()
        
        if client is None:
            return {
                "status": "unavailable",
                "connected": False,
                "host": REDIS_HOST,
                "port": REDIS_PORT,
                "db": REDIS_DB,
                "ssl": REDIS_SSL,
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
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB,
            "ssl": REDIS_SSL,
            "latency_ms": round(latency_ms, 2),
            "redis_version": redis_version,
            "uptime_seconds": uptime
        }
        
    except (ConnectionError, TimeoutError, RedisError) as e:
        return {
            "status": "unhealthy",
            "connected": False,
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB,
            "ssl": REDIS_SSL,
            "error": str(e)
        }
    except Exception as e:
        return {
            "status": "error",
            "connected": False,
            "host": REDIS_HOST,
            "port": REDIS_PORT,
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
