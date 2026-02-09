"""
Last State Service
Redis-based service for storing and serving the last known state of each sensor.
Provides fast access without MongoDB queries on each UI refresh.

Key Design:
- ls:{tenant_id}:sensor:{sensor_id} -> JSON state
- ls:{tenant_id}:building:{building_id}:sensors -> SET of sensor_ids
- ls:{tenant_id}:floor:{floor_id}:sensors -> SET of sensor_ids
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from config.redis import get_redis_client, is_redis_available

logger = logging.getLogger(__name__)


class LastStateService:
    """Service for managing sensor last states in Redis"""
    
    # Configuration
    OFFLINE_THRESHOLD = 120  # seconds - sensor considered offline after this
    STATE_TTL = 604800       # 7 days in seconds
    
    # Key prefixes
    PREFIX = "ls"
    
    def __init__(self):
        self._db = None  # MongoDB reference for fallback
    
    def set_db(self, db):
        """Set MongoDB database reference for fallback"""
        self._db = db
    
    # ==================== Key Builders ====================
    
    def _sensor_key(self, tenant_id: str, sensor_id: str) -> str:
        """Build Redis key for sensor state"""
        return f"{self.PREFIX}:{tenant_id}:sensor:{sensor_id}"
    
    def _building_sensors_key(self, tenant_id: str, building_id: str) -> str:
        """Build Redis key for building's sensor set"""
        return f"{self.PREFIX}:{tenant_id}:building:{building_id}:sensors"
    
    def _floor_sensors_key(self, tenant_id: str, floor_id: str) -> str:
        """Build Redis key for floor's sensor set"""
        return f"{self.PREFIX}:{tenant_id}:floor:{floor_id}:sensors"
    
    def _all_sensors_key(self, tenant_id: str) -> str:
        """Build Redis key for all sensors in tenant"""
        return f"{self.PREFIX}:{tenant_id}:all_sensors"
    
    # ==================== Core Operations ====================
    
    async def update_sensor_state(
        self,
        sensor_id: str,
        tenant_id: str,
        building_id: Optional[str],
        floor_id: Optional[str],
        state_data: Dict[str, Any]
    ) -> bool:
        """
        Update sensor state in Redis.
        Called on each MQTT event or API ingest.
        
        Args:
            sensor_id: Unique sensor identifier
            tenant_id: Tenant identifier for partitioning
            building_id: Building identifier for indexing
            floor_id: Floor identifier for indexing
            state_data: State data to store
            
        Returns:
            True if update successful, False otherwise
        """
        redis = get_redis_client()
        if not redis:
            logger.warning("Redis unavailable, skipping last state update")
            return False
        
        try:
            # Build full state object
            state = {
                "sensor_id": sensor_id,
                "tenant_id": tenant_id,
                "building_id": building_id,
                "floor_id": floor_id,
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                **state_data
            }
            
            # Store sensor state with TTL
            sensor_key = self._sensor_key(tenant_id, sensor_id)
            redis.setex(sensor_key, self.STATE_TTL, json.dumps(state, default=str))
            
            # Add to building index if building_id provided
            if building_id:
                building_key = self._building_sensors_key(tenant_id, building_id)
                redis.sadd(building_key, sensor_id)
            
            # Add to floor index if floor_id provided
            if floor_id:
                floor_key = self._floor_sensors_key(tenant_id, floor_id)
                redis.sadd(floor_key, sensor_id)
            
            # Add to tenant's all sensors set
            all_key = self._all_sensors_key(tenant_id)
            redis.sadd(all_key, sensor_id)
            
            logger.debug(f"Updated last state for sensor {sensor_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating last state for sensor {sensor_id}: {e}")
            return False
    
    async def get_sensor_state(
        self,
        sensor_id: str,
        tenant_id: str,
        with_fallback: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get sensor state from Redis with status calculation.
        
        Args:
            sensor_id: Sensor identifier
            tenant_id: Tenant identifier
            with_fallback: If True, fallback to MongoDB on cache miss
            
        Returns:
            Sensor state dict with calculated status, or None
        """
        redis = get_redis_client()
        
        # Try Redis first
        if redis:
            try:
                sensor_key = self._sensor_key(tenant_id, sensor_id)
                data = redis.get(sensor_key)
                if data:
                    state = json.loads(data)
                    return self._enrich_state(state)
            except Exception as e:
                logger.error(f"Error getting sensor state from Redis: {e}")
        
        # Fallback to MongoDB
        if with_fallback and self._db is not None:
            return await self._fallback_get_sensor(sensor_id, tenant_id)
        
        return None
    
    async def get_building_sensors_state(
        self,
        tenant_id: str,
        building_id: str,
        with_fallback: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Get all sensor states for a building using optimized MGET.
        
        Args:
            tenant_id: Tenant identifier
            building_id: Building identifier
            with_fallback: If True, fallback to MongoDB on cache miss
            
        Returns:
            List of sensor states with calculated status
        """
        redis = get_redis_client()
        
        if redis:
            try:
                # Get sensor IDs from building set
                building_key = self._building_sensors_key(tenant_id, building_id)
                sensor_ids = redis.smembers(building_key)
                
                if sensor_ids:
                    # Build keys for MGET
                    keys = [self._sensor_key(tenant_id, sid) for sid in sensor_ids]
                    
                    # Batch get all states
                    states_raw = redis.mget(keys)
                    
                    states = []
                    for raw in states_raw:
                        if raw:
                            state = json.loads(raw)
                            states.append(self._enrich_state(state))
                    
                    # Sort by room/space/order
                    states.sort(key=lambda x: (
                        x.get("room_name", ""),
                        x.get("space_name", ""),
                        x.get("display_order", 999)
                    ))
                    
                    return states
                    
            except Exception as e:
                logger.error(f"Error getting building sensors from Redis: {e}")
        
        # Fallback to MongoDB
        if with_fallback and self._db is not None:
            return await self._fallback_get_building_sensors(tenant_id, building_id)
        
        return []
    
    async def get_floor_sensors_state(
        self,
        tenant_id: str,
        floor_id: str,
        with_fallback: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Get all sensor states for a floor using optimized MGET.
        """
        redis = get_redis_client()
        
        if redis:
            try:
                floor_key = self._floor_sensors_key(tenant_id, floor_id)
                sensor_ids = redis.smembers(floor_key)
                
                if sensor_ids:
                    keys = [self._sensor_key(tenant_id, sid) for sid in sensor_ids]
                    states_raw = redis.mget(keys)
                    
                    states = []
                    for raw in states_raw:
                        if raw:
                            state = json.loads(raw)
                            states.append(self._enrich_state(state))
                    
                    states.sort(key=lambda x: (
                        x.get("room_name", ""),
                        x.get("space_name", ""),
                        x.get("display_order", 999)
                    ))
                    
                    return states
                    
            except Exception as e:
                logger.error(f"Error getting floor sensors from Redis: {e}")
        
        # Fallback to MongoDB
        if with_fallback and self._db is not None:
            return await self._fallback_get_floor_sensors(tenant_id, floor_id)
        
        return []
    
    # ==================== Index Management ====================
    
    async def move_sensor_to_building(
        self,
        sensor_id: str,
        tenant_id: str,
        old_building_id: Optional[str],
        new_building_id: Optional[str],
        old_floor_id: Optional[str] = None,
        new_floor_id: Optional[str] = None
    ):
        """
        Move sensor from one building/floor to another.
        Called when sensor is reassigned.
        """
        redis = get_redis_client()
        if not redis:
            return
        
        try:
            # Remove from old building
            if old_building_id:
                old_key = self._building_sensors_key(tenant_id, old_building_id)
                redis.srem(old_key, sensor_id)
            
            # Add to new building
            if new_building_id:
                new_key = self._building_sensors_key(tenant_id, new_building_id)
                redis.sadd(new_key, sensor_id)
            
            # Remove from old floor
            if old_floor_id:
                old_floor_key = self._floor_sensors_key(tenant_id, old_floor_id)
                redis.srem(old_floor_key, sensor_id)
            
            # Add to new floor
            if new_floor_id:
                new_floor_key = self._floor_sensors_key(tenant_id, new_floor_id)
                redis.sadd(new_floor_key, sensor_id)
                
            logger.debug(f"Moved sensor {sensor_id} from building {old_building_id} to {new_building_id}")
            
        except Exception as e:
            logger.error(f"Error moving sensor in Redis: {e}")
    
    async def remove_sensor(self, sensor_id: str, tenant_id: str, building_id: Optional[str] = None, floor_id: Optional[str] = None):
        """Remove sensor from all indexes"""
        redis = get_redis_client()
        if not redis:
            return
        
        try:
            # Remove state
            sensor_key = self._sensor_key(tenant_id, sensor_id)
            redis.delete(sensor_key)
            
            # Remove from building set
            if building_id:
                building_key = self._building_sensors_key(tenant_id, building_id)
                redis.srem(building_key, sensor_id)
            
            # Remove from floor set
            if floor_id:
                floor_key = self._floor_sensors_key(tenant_id, floor_id)
                redis.srem(floor_key, sensor_id)
            
            # Remove from all sensors set
            all_key = self._all_sensors_key(tenant_id)
            redis.srem(all_key, sensor_id)
            
            logger.debug(f"Removed sensor {sensor_id} from Redis")
            
        except Exception as e:
            logger.error(f"Error removing sensor from Redis: {e}")
    
    # ==================== Rehydration ====================
    
    async def rehydrate_from_mongo(self, tenant_id: str, building_id: Optional[str] = None):
        """
        Rebuild Redis cache from MongoDB.
        Called on cache miss or manual refresh.
        """
        if self._db is None:
            logger.warning("No MongoDB reference for rehydration")
            return
        
        try:
            # Build query
            query = {"tenant_id": tenant_id}
            if building_id:
                query["building_id"] = building_id
            
            # Get sensors
            sensors = await self._db.sensors.find(query, {"_id": 0}).to_list(1000)
            
            for sensor in sensors:
                # Get last event for this sensor
                last_event = await self._db.events.find_one(
                    {"sensor_id": sensor["id"]},
                    {"_id": 0},
                    sort=[("timestamp", -1)]
                )
                
                # Build state
                state_data = {
                    "device_id": sensor.get("device_id"),
                    "sensor_name": sensor.get("name"),
                    "room_id": sensor.get("room_id"),
                    "room_name": sensor.get("room_name"),
                    "space_id": sensor.get("space_id"),
                    "space_name": sensor.get("space_name"),
                    "model": sensor.get("model"),
                    "firmware_version": sensor.get("firmware_version"),
                    "display_order": sensor.get("display_order", 999)
                }
                
                if last_event:
                    state_data.update({
                        "last_event_type": last_event.get("type"),
                        "last_event_severity": last_event.get("severity"),
                        "presence_detected": last_event.get("presence_detected"),
                        "target_count": last_event.get("target_count"),
                        "active_regions": last_event.get("active_regions", [])
                    })
                
                # Update Redis
                await self.update_sensor_state(
                    sensor_id=sensor["id"],
                    tenant_id=tenant_id,
                    building_id=sensor.get("building_id"),
                    floor_id=sensor.get("floor_id"),
                    state_data=state_data
                )
            
            logger.info(f"Rehydrated {len(sensors)} sensors for tenant {tenant_id}")
            
        except Exception as e:
            logger.error(f"Error rehydrating from MongoDB: {e}")
    
    # ==================== Status Calculation ====================
    
    def _enrich_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add calculated fields to state.
        - status: online/offline/unknown
        - last_seen_ago: human readable time
        """
        enriched = state.copy()
        
        # Calculate status
        last_seen = state.get("last_seen_at")
        if not last_seen:
            enriched["status"] = "unknown"
            enriched["last_seen_ago"] = None
        else:
            try:
                if isinstance(last_seen, str):
                    last_seen_dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                else:
                    last_seen_dt = last_seen
                
                age_seconds = (datetime.now(timezone.utc) - last_seen_dt).total_seconds()
                
                # Determine status
                if age_seconds < self.OFFLINE_THRESHOLD:
                    enriched["status"] = "online"
                else:
                    enriched["status"] = "offline"
                
                # Human readable time ago
                enriched["last_seen_ago"] = self._format_time_ago(age_seconds)
                enriched["age_seconds"] = int(age_seconds)
                
            except Exception as e:
                logger.warning(f"Error calculating status: {e}")
                enriched["status"] = "unknown"
                enriched["last_seen_ago"] = None
        
        return enriched
    
    def _format_time_ago(self, seconds: float) -> str:
        """Format seconds into human readable 'time ago' string"""
        if seconds < 60:
            return f"il y a {int(seconds)} sec"
        elif seconds < 3600:
            minutes = int(seconds / 60)
            return f"il y a {minutes} min"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f"il y a {hours}h"
        else:
            days = int(seconds / 86400)
            return f"il y a {days}j"
    
    # ==================== Fallback Methods ====================
    
    async def _fallback_get_sensor(self, sensor_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Fallback to MongoDB for single sensor"""
        if self._db is None:
            return None
        
        try:
            sensor = await self._db.sensors.find_one(
                {"id": sensor_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            if not sensor:
                return None
            
            last_event = await self._db.events.find_one(
                {"sensor_id": sensor_id},
                {"_id": 0},
                sort=[("timestamp", -1)]
            )
            
            state = self._build_state_from_mongo(sensor, last_event)
            
            # Rehydrate Redis (write-back)
            await self.update_sensor_state(
                sensor_id=sensor_id,
                tenant_id=tenant_id,
                building_id=sensor.get("building_id"),
                floor_id=sensor.get("floor_id"),
                state_data=state
            )
            
            return self._enrich_state(state)
            
        except Exception as e:
            logger.error(f"Fallback get sensor error: {e}")
            return None
    
    async def _fallback_get_building_sensors(self, tenant_id: str, building_id: str) -> List[Dict[str, Any]]:
        """Fallback to MongoDB for building sensors"""
        if self._db is None:
            return []
        
        try:
            # Filter by building_id only - tenant_id may be inconsistent
            sensors = await self._db.sensors.find(
                {"building_id": building_id},
                {"_id": 0}
            ).to_list(500)
            
            states = []
            for sensor in sensors:
                # Build state directly from sensor document (faster than querying events)
                state = {
                    "sensor_id": sensor.get("id"),
                    "device_id": sensor.get("device_id"),
                    "sensor_name": sensor.get("name"),
                    "room_id": sensor.get("room_id"),
                    "room_name": sensor.get("room_name"),
                    "space_id": sensor.get("room_space_id"),
                    "space_name": sensor.get("space_name"),
                    "floor_id": sensor.get("floor_id"),
                    "model": sensor.get("model"),
                    "firmware_version": sensor.get("firmware_version"),
                    "status": sensor.get("status", "UNKNOWN"),
                    "last_seen": sensor.get("last_seen"),
                    "presence_detected": sensor.get("current_presence", False),
                    "target_count": sensor.get("current_target_count", 0),
                    "last_event_type": sensor.get("last_event_type"),
                    "last_event_severity": sensor.get("last_event_severity"),
                    "updated_at": sensor.get("last_seen") or sensor.get("updated_at")
                }
                
                states.append(self._enrich_state(state))
            
            # Sort by room name
            states.sort(key=lambda x: (
                x.get("room_name") or "",
                x.get("space_name") or "",
                x.get("sensor_name") or ""
            ))
            
            return states
            
        except Exception as e:
            logger.error(f"Fallback get building sensors error: {e}")
            return []
    
    async def _fallback_get_floor_sensors(self, tenant_id: str, floor_id: str) -> List[Dict[str, Any]]:
        """Fallback to MongoDB for floor sensors"""
        if self._db is None:
            return []
        
        try:
            sensors = await self._db.sensors.find(
                {"tenant_id": tenant_id, "floor_id": floor_id},
                {"_id": 0}
            ).to_list(500)
            
            states = []
            for sensor in sensors:
                last_event = await self._db.events.find_one(
                    {"sensor_id": sensor["id"]},
                    {"_id": 0},
                    sort=[("timestamp", -1)]
                )
                
                state = self._build_state_from_mongo(sensor, last_event)
                
                # Rehydrate Redis
                await self.update_sensor_state(
                    sensor_id=sensor["id"],
                    tenant_id=tenant_id,
                    building_id=sensor.get("building_id"),
                    floor_id=floor_id,
                    state_data=state
                )
                
                states.append(self._enrich_state(state))
            
            return states
            
        except Exception as e:
            logger.error(f"Fallback get floor sensors error: {e}")
            return []
    
    def _build_state_from_mongo(self, sensor: Dict, last_event: Optional[Dict]) -> Dict[str, Any]:
        """Build state dict from MongoDB documents"""
        state = {
            "sensor_id": sensor["id"],
            "tenant_id": sensor.get("tenant_id"),
            "building_id": sensor.get("building_id"),
            "floor_id": sensor.get("floor_id"),
            "device_id": sensor.get("device_id"),
            "sensor_name": sensor.get("name"),
            "room_id": sensor.get("room_id"),
            "room_name": sensor.get("room_name"),
            "space_id": sensor.get("space_id"),
            "space_name": sensor.get("space_name"),
            "model": sensor.get("model"),
            "firmware_version": sensor.get("firmware_version"),
            "display_order": sensor.get("display_order", 999)
        }
        
        if last_event:
            state["last_seen_at"] = last_event.get("timestamp")
            state["last_event_type"] = last_event.get("type")
            state["last_event_severity"] = last_event.get("severity")
            state["presence_detected"] = last_event.get("presence_detected")
            state["target_count"] = last_event.get("target_count")
            state["active_regions"] = last_event.get("active_regions", [])
        
        return state
    
    # ==================== Statistics ====================
    
    async def get_building_stats(self, tenant_id: str, building_id: str) -> Dict[str, int]:
        """Get online/offline/unknown counts for a building"""
        states = await self.get_building_sensors_state(tenant_id, building_id)
        
        stats = {"total": 0, "online": 0, "offline": 0, "unknown": 0}
        for state in states:
            stats["total"] += 1
            status = state.get("status", "unknown")
            stats[status] = stats.get(status, 0) + 1
        
        return stats
    
    async def get_floor_stats(self, tenant_id: str, floor_id: str) -> Dict[str, int]:
        """Get online/offline/unknown counts for a floor"""
        states = await self.get_floor_sensors_state(tenant_id, floor_id)
        
        stats = {"total": 0, "online": 0, "offline": 0, "unknown": 0}
        for state in states:
            stats["total"] += 1
            status = state.get("status", "unknown")
            stats[status] = stats.get(status, 0) + 1
        
        return stats


# Global instance
_last_state_service: Optional[LastStateService] = None


def get_last_state_service() -> LastStateService:
    """Get or create the global LastStateService instance"""
    global _last_state_service
    if _last_state_service is None:
        _last_state_service = LastStateService()
    return _last_state_service


def init_last_state_service(db) -> LastStateService:
    """Initialize the service with MongoDB reference"""
    service = get_last_state_service()
    service.set_db(db)
    return service
