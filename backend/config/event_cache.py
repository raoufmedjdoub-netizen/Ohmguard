"""
Redis Cache Service for Events
Provides caching layer for event queries to reduce MongoDB load.
Designed to fail gracefully - all operations return sensible defaults if Redis is unavailable.
"""
import json
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_PREFIX = "ohmguard:events"
DEFAULT_TTL = 300  # 5 minutes
MAX_CACHED_EVENTS = 100  # Max events per cache key


class EventCacheService:
    """
    Service for caching event data in Redis.
    Implements cache-aside pattern with automatic invalidation.
    All methods are designed to fail gracefully if Redis is unavailable.
    """
    
    def __init__(self):
        self._stats = {
            "hits": 0,
            "misses": 0,
            "invalidations": 0,
            "errors": 0
        }
    
    def _get_client(self):
        """Get Redis client, return None if unavailable."""
        try:
            from config.redis import get_redis_client
            return get_redis_client()
        except Exception as e:
            logger.debug(f"Redis unavailable, cache disabled: {e}")
            self._stats["errors"] += 1
            return None
    
    def _build_cache_key(self, tenant_id: Optional[str] = None, 
                         client_id: Optional[str] = None,
                         filters: Optional[Dict] = None) -> str:
        """
        Build a unique cache key based on query parameters.
        Format: ohmguard:events:{tenant_id}:{client_id}:{filter_hash}
        """
        parts = [CACHE_PREFIX]
        parts.append(tenant_id or "all")
        parts.append(client_id or "all")
        
        # Create a deterministic hash of filters
        if filters:
            # Sort keys for consistency
            filter_str = json.dumps(filters, sort_keys=True)
            filter_hash = hash(filter_str) & 0xffffffff  # Positive hash
            parts.append(str(filter_hash))
        else:
            parts.append("default")
        
        return ":".join(parts)
    
    def _serialize_events(self, events: List[Dict]) -> str:
        """Serialize events list to JSON string."""
        return json.dumps(events, default=str)
    
    def _deserialize_events(self, data: str) -> List[Dict]:
        """Deserialize JSON string to events list."""
        return json.loads(data)
    
    def get_cached_events(self, tenant_id: Optional[str] = None,
                          client_id: Optional[str] = None,
                          filters: Optional[Dict] = None) -> Optional[List[Dict]]:
        """
        Get events from cache if available.
        
        Returns:
            List of events if cache hit, None if cache miss
        """
        redis = self._get_client()
        if not redis:
            return None
        
        cache_key = self._build_cache_key(tenant_id, client_id, filters)
        
        try:
            cached_data = redis.get(cache_key)
            if cached_data:
                self._stats["hits"] += 1
                logger.debug(f"Cache HIT for key: {cache_key}")
                return self._deserialize_events(cached_data)
            else:
                self._stats["misses"] += 1
                logger.debug(f"Cache MISS for key: {cache_key}")
                return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def set_cached_events(self, events: List[Dict],
                          tenant_id: Optional[str] = None,
                          client_id: Optional[str] = None,
                          filters: Optional[Dict] = None,
                          ttl: int = DEFAULT_TTL) -> bool:
        """
        Store events in cache.
        
        Args:
            events: List of event dictionaries
            tenant_id: Tenant ID for cache key
            client_id: Client ID for cache key
            filters: Query filters for cache key
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully, False otherwise
        """
        redis = self._get_client()
        if not redis:
            return False
        
        # Limit cached events to prevent memory bloat
        events_to_cache = events[:MAX_CACHED_EVENTS]
        cache_key = self._build_cache_key(tenant_id, client_id, filters)
        
        try:
            serialized = self._serialize_events(events_to_cache)
            redis.setex(cache_key, ttl, serialized)
            logger.debug(f"Cached {len(events_to_cache)} events with key: {cache_key}, TTL: {ttl}s")
            return True
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def invalidate_tenant_cache(self, tenant_id: str) -> int:
        """
        Invalidate all cached events for a specific tenant.
        Called when new events are created or updated.
        
        Returns:
            Number of keys invalidated
        """
        redis = self._get_client()
        if not redis:
            return 0
        
        pattern = f"{CACHE_PREFIX}:{tenant_id}:*"
        
        try:
            keys = list(redis.scan_iter(match=pattern))
            if keys:
                deleted = redis.delete(*keys)
                self._stats["invalidations"] += deleted
                logger.info(f"Invalidated {deleted} cache keys for tenant: {tenant_id}")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            return 0
    
    def invalidate_client_cache(self, client_id: str) -> int:
        """
        Invalidate all cached events for a specific client.
        
        Returns:
            Number of keys invalidated
        """
        redis = self._get_client()
        if not redis:
            return 0
        
        pattern = f"{CACHE_PREFIX}:*:{client_id}:*"
        
        try:
            keys = list(redis.scan_iter(match=pattern))
            if keys:
                deleted = redis.delete(*keys)
                self._stats["invalidations"] += deleted
                logger.info(f"Invalidated {deleted} cache keys for client: {client_id}")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            return 0
    
    def invalidate_all_events_cache(self) -> int:
        """
        Invalidate ALL event caches.
        Use sparingly - for major data changes only.
        
        Returns:
            Number of keys invalidated
        """
        redis = self._get_client()
        if not redis:
            return 0
        
        pattern = f"{CACHE_PREFIX}:*"
        
        try:
            keys = list(redis.scan_iter(match=pattern))
            if keys:
                deleted = redis.delete(*keys)
                self._stats["invalidations"] += deleted
                logger.info(f"Invalidated ALL {deleted} event cache keys")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with hits, misses, hit_rate, invalidations
        """
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0
        
        return {
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "total_requests": total,
            "hit_rate_percent": round(hit_rate, 2),
            "invalidations": self._stats["invalidations"]
        }
    
    def reset_stats(self):
        """Reset cache statistics."""
        self._stats = {
            "hits": 0,
            "misses": 0,
            "invalidations": 0
        }


# Global singleton instance
_event_cache_service: Optional[EventCacheService] = None


def get_event_cache_service() -> EventCacheService:
    """Get the global event cache service instance."""
    global _event_cache_service
    if _event_cache_service is None:
        _event_cache_service = EventCacheService()
    return _event_cache_service
