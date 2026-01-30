"""
Redis Configuration Module
Centralizes Redis connection handling for the OhmGuard backend.
"""
import os
import logging
from typing import Optional
import redis
from redis.exceptions import ConnectionError, TimeoutError

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

# Global client instance
_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """
    Get or create a Redis client instance.
    Uses a connection pool for efficient connection management.
    
    Returns:
        redis.Redis: Connected Redis client instance
        
    Raises:
        ConnectionError: If unable to connect to Redis
    """
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
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
            "decode_responses": True  # Return strings instead of bytes
        }
        
        # Only add password if provided
        if REDIS_PASSWORD:
            pool_kwargs["password"] = REDIS_PASSWORD
        
        # Only add SSL if enabled (use ssl_context for newer redis versions)
        if REDIS_SSL:
            import ssl
            pool_kwargs["ssl"] = True
            pool_kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        
        pool = redis.ConnectionPool(**pool_kwargs)
        
        _redis_client = redis.Redis(connection_pool=pool)
        
        # Test connection
        _redis_client.ping()
        logger.info("Redis connection established successfully")
        
        return _redis_client
        
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise ConnectionError(f"Unable to connect to Redis at {REDIS_HOST}:{REDIS_PORT}: {e}")


def close_redis_client():
    """
    Close the Redis client connection and release resources.
    Should be called during application shutdown.
    """
    global _redis_client
    
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
    
    Returns:
        dict: Health check result with status, latency, and connection info
    """
    try:
        client = get_redis_client()
        
        # Measure ping latency
        import time
        start = time.time()
        client.ping()
        latency_ms = (time.time() - start) * 1000
        
        # Get server info
        info = client.info("server")
        
        return {
            "status": "healthy",
            "connected": True,
            "host": REDIS_HOST,
            "port": REDIS_PORT,
            "db": REDIS_DB,
            "ssl": REDIS_SSL,
            "latency_ms": round(latency_ms, 2),
            "redis_version": info.get("redis_version", "unknown"),
            "uptime_seconds": info.get("uptime_in_seconds", 0)
        }
        
    except (ConnectionError, TimeoutError) as e:
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
async def get_redis_client_async() -> redis.Redis:
    """
    Async wrapper for get_redis_client().
    Note: This uses the synchronous redis client.
    For fully async operations, consider using redis.asyncio.Redis.
    """
    return get_redis_client()
