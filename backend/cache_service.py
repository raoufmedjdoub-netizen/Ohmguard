"""
Cache Service for OhmGuard
Provides Redis-based caching for frequently accessed data
"""
import json
import logging
from typing import Optional, Any, List, Dict
from datetime import datetime, timezone
from config.redis import get_redis_client, is_redis_available

logger = logging.getLogger(__name__)

# Cache TTL constants (in seconds)
TTL_SHORT = 30        # 30 seconds - for real-time data
TTL_MEDIUM = 300      # 5 minutes - for semi-static data
TTL_LONG = 3600       # 1 hour - for static data
TTL_VERY_LONG = 86400 # 24 hours - for rarely changing data

# Cache key prefixes
PREFIX_SENSORS = "sensors:"
PREFIX_EVENTS = "events:"
PREFIX_STATS = "stats:"
PREFIX_DEVICE_MAP = "device_map:"
PREFIX_DASHBOARD = "dashboard:"


class CacheService:
    """Redis-based cache service with automatic fallback"""
    
    def __init__(self):
        self._enabled = True
    
    def _get_client(self):
        """Get Redis client or None if unavailable"""
        if not self._enabled:
            return None
        return get_redis_client()
    
    def disable(self):
        """Disable caching (useful for debugging)"""
        self._enabled = False
        logger.info("Cache service disabled")
    
    def enable(self):
        """Enable caching"""
        self._enabled = True
        logger.info("Cache service enabled")
    
    # ==================== Generic Cache Methods ====================
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        client = self._get_client()
        if not client:
            return None
        
        try:
            data = client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.debug(f"Cache get error for {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = TTL_MEDIUM) -> bool:
        """Set value in cache with TTL"""
        client = self._get_client()
        if not client:
            return False
        
        try:
            client.setex(key, ttl, json.dumps(value, default=str))
            return True
        except Exception as e:
            logger.debug(f"Cache set error for {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        client = self._get_client()
        if not client:
            return False
        
        try:
            client.delete(key)
            return True
        except Exception as e:
            logger.debug(f"Cache delete error for {key}: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        client = self._get_client()
        if not client:
            return 0
        
        try:
            keys = client.keys(pattern)
            if keys:
                return client.delete(*keys)
            return 0
        except Exception as e:
            logger.debug(f"Cache delete pattern error for {pattern}: {e}")
            return 0
    
    # ==================== Sensors Cache ====================
    
    def get_sensors_list(self, tenant_id: str) -> Optional[List[Dict]]:
        """Get cached sensors list for tenant"""
        key = f"{PREFIX_SENSORS}list:{tenant_id}"
        return self.get(key)
    
    def set_sensors_list(self, tenant_id: str, sensors: List[Dict]) -> bool:
        """Cache sensors list for tenant"""
        key = f"{PREFIX_SENSORS}list:{tenant_id}"
        return self.set(key, sensors, TTL_SHORT)
    
    def invalidate_sensors(self, tenant_id: str = None):
        """Invalidate sensors cache"""
        if tenant_id:
            self.delete(f"{PREFIX_SENSORS}list:{tenant_id}")
        else:
            self.delete_pattern(f"{PREFIX_SENSORS}list:*")
        logger.debug(f"Invalidated sensors cache for tenant: {tenant_id or 'all'}")
    
    # ==================== Device Mapping Cache ====================
    
    def get_device_sensor_map(self, device_id: str) -> Optional[Dict]:
        """Get cached sensor for device ID"""
        key = f"{PREFIX_DEVICE_MAP}{device_id}"
        return self.get(key)
    
    def set_device_sensor_map(self, device_id: str, sensor: Dict) -> bool:
        """Cache device to sensor mapping"""
        key = f"{PREFIX_DEVICE_MAP}{device_id}"
        return self.set(key, sensor, TTL_LONG)
    
    def invalidate_device_map(self, device_id: str = None):
        """Invalidate device mapping cache"""
        if device_id:
            self.delete(f"{PREFIX_DEVICE_MAP}{device_id}")
        else:
            self.delete_pattern(f"{PREFIX_DEVICE_MAP}*")
    
    # ==================== Events Cache ====================
    
    def get_recent_events(self, tenant_id: str, limit: int = 50) -> Optional[List[Dict]]:
        """Get cached recent events for tenant"""
        key = f"{PREFIX_EVENTS}recent:{tenant_id}:{limit}"
        return self.get(key)
    
    def set_recent_events(self, tenant_id: str, events: List[Dict], limit: int = 50) -> bool:
        """Cache recent events for tenant"""
        key = f"{PREFIX_EVENTS}recent:{tenant_id}:{limit}"
        return self.set(key, events, TTL_SHORT)
    
    def invalidate_events(self, tenant_id: str = None):
        """Invalidate events cache"""
        if tenant_id:
            self.delete_pattern(f"{PREFIX_EVENTS}*:{tenant_id}:*")
        else:
            self.delete_pattern(f"{PREFIX_EVENTS}*")
        logger.debug(f"Invalidated events cache for tenant: {tenant_id or 'all'}")
    
    # ==================== Dashboard Stats Cache ====================
    
    def get_dashboard_stats(self, tenant_id: str) -> Optional[Dict]:
        """Get cached dashboard statistics"""
        key = f"{PREFIX_DASHBOARD}stats:{tenant_id}"
        return self.get(key)
    
    def set_dashboard_stats(self, tenant_id: str, stats: Dict) -> bool:
        """Cache dashboard statistics"""
        key = f"{PREFIX_DASHBOARD}stats:{tenant_id}"
        return self.set(key, stats, TTL_SHORT)
    
    def invalidate_dashboard(self, tenant_id: str = None):
        """Invalidate dashboard cache"""
        if tenant_id:
            self.delete(f"{PREFIX_DASHBOARD}stats:{tenant_id}")
        else:
            self.delete_pattern(f"{PREFIX_DASHBOARD}*")
    
    # ==================== Statistics Cache ====================
    
    def get_daily_stats(self, tenant_id: str, days: int) -> Optional[List[Dict]]:
        """Get cached daily statistics"""
        key = f"{PREFIX_STATS}daily:{tenant_id}:{days}"
        return self.get(key)
    
    def set_daily_stats(self, tenant_id: str, stats: List[Dict], days: int) -> bool:
        """Cache daily statistics"""
        key = f"{PREFIX_STATS}daily:{tenant_id}:{days}"
        return self.set(key, stats, TTL_MEDIUM)
    
    def invalidate_stats(self, tenant_id: str = None):
        """Invalidate statistics cache"""
        if tenant_id:
            self.delete_pattern(f"{PREFIX_STATS}*:{tenant_id}:*")
        else:
            self.delete_pattern(f"{PREFIX_STATS}*")
    
    # ==================== Bulk Invalidation ====================
    
    def invalidate_tenant(self, tenant_id: str):
        """Invalidate all cache for a tenant"""
        self.invalidate_sensors(tenant_id)
        self.invalidate_events(tenant_id)
        self.invalidate_dashboard(tenant_id)
        self.invalidate_stats(tenant_id)
        logger.info(f"Invalidated all cache for tenant: {tenant_id}")
    
    def invalidate_all(self):
        """Invalidate entire cache"""
        client = self._get_client()
        if client:
            try:
                client.flushdb()
                logger.info("Flushed entire cache database")
            except Exception as e:
                logger.error(f"Error flushing cache: {e}")
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        client = self._get_client()
        if not client:
            return {"status": "unavailable", "enabled": self._enabled}
        
        try:
            info = client.info("memory")
            keys_count = client.dbsize()
            return {
                "status": "connected",
                "enabled": self._enabled,
                "keys_count": keys_count,
                "used_memory": info.get("used_memory_human", "unknown"),
                "peak_memory": info.get("used_memory_peak_human", "unknown")
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}


# Global cache service instance
cache_service = CacheService()


def get_cache_service() -> CacheService:
    """Get the global cache service instance"""
    return cache_service
