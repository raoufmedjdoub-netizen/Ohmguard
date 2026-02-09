"""
Presence Session Service
Manages presence sessions - aggregated presence periods for each sensor.
A session starts when presence=true and ends when presence=false.

No timeout mechanism - sessions close only when presence=false is received.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from config.redis import get_redis_client

logger = logging.getLogger(__name__)


class PresenceSessionService:
    """Service for managing presence sessions"""
    
    # Redis key prefix for active sessions
    PREFIX = "ps"
    
    def __init__(self, db: AsyncIOMotorDatabase = None):
        self._db = db
    
    def set_db(self, db: AsyncIOMotorDatabase):
        """Set MongoDB database reference"""
        self._db = db
    
    # ==================== Redis Key Builders ====================
    
    def _active_session_key(self, tenant_id: str, sensor_id: str) -> str:
        """Build Redis key for active session"""
        return f"{self.PREFIX}:{tenant_id}:sensor:{sensor_id}:active"
    
    # ==================== Session Management ====================
    
    async def handle_presence_event(
        self,
        sensor_id: str,
        device_id: str,
        tenant_id: str,
        presence_detected: bool,
        metadata: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Handle a presence event and manage session lifecycle.
        
        Args:
            sensor_id: Sensor identifier
            device_id: Device identifier
            tenant_id: Tenant identifier
            presence_detected: True if presence detected, False otherwise
            metadata: Additional metadata (building_id, room_name, etc.)
            
        Returns:
            Completed session dict if a session was closed, None otherwise
        """
        redis = get_redis_client()
        session_key = self._active_session_key(tenant_id, sensor_id)
        
        if presence_detected:
            # Start a new session if none exists
            return await self._start_session(
                redis, session_key, sensor_id, device_id, tenant_id, metadata
            )
        else:
            # End the active session if one exists
            return await self._end_session(
                redis, session_key, sensor_id, tenant_id
            )
    
    async def _start_session(
        self,
        redis,
        session_key: str,
        sensor_id: str,
        device_id: str,
        tenant_id: str,
        metadata: Dict[str, Any]
    ) -> None:
        """Start a new presence session"""
        
        # Check if session already exists in Redis
        if redis:
            existing = redis.get(session_key)
            if existing:
                # Session already active, ignore
                logger.debug(f"Session already active in Redis for sensor {sensor_id}")
                return None
        
        # Fallback: Check if session already exists in MongoDB (when Redis is unavailable)
        if self._db is not None:
            existing_db = await self._db.presence_sessions.find_one({
                "sensor_id": sensor_id,
                "status": "ACTIVE"
            })
            if existing_db:
                logger.debug(f"Session already active in MongoDB for sensor {sensor_id}")
                return None
        
        # Create new session
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        session_data = {
            "id": session_id,
            "sensor_id": sensor_id,
            "device_id": device_id,
            "tenant_id": tenant_id,
            "client_id": metadata.get("client_id"),
            "building_id": metadata.get("building_id"),
            "floor_id": metadata.get("floor_id"),
            "room_id": metadata.get("room_id"),
            "space_id": metadata.get("space_id"),
            "sensor_name": metadata.get("sensor_name"),
            "room_name": metadata.get("room_name"),
            "space_name": metadata.get("space_name"),
            "start_at": now.isoformat(),
            "end_at": None,
            "duration_sec": None,
            "status": "ACTIVE",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
        # Store in Redis (no TTL - no timeout)
        if redis:
            redis.set(session_key, json.dumps(session_data, default=str))
        
        # Also store in MongoDB as active session
        if self._db is not None:
            await self._db.presence_sessions.insert_one(session_data)
        
        logger.info(f"Started presence session {session_id} for sensor {sensor_id}")
        return None  # No completed session to return
    
    async def _end_session(
        self,
        redis,
        session_key: str,
        sensor_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """End an active presence session"""
        
        # Get active session from Redis
        session_data = None
        if redis:
            raw = redis.get(session_key)
            if raw:
                session_data = json.loads(raw)
        
        if not session_data:
            # No active session, try to find in MongoDB
            if self._db is not None:
                session_data = await self._db.presence_sessions.find_one(
                    {"sensor_id": sensor_id, "tenant_id": tenant_id, "status": "ACTIVE"},
                    {"_id": 0}
                )
        
        if not session_data:
            # No session to close
            logger.debug(f"No active session to close for sensor {sensor_id}")
            return None
        
        # Calculate duration
        now = datetime.now(timezone.utc)
        start_at = datetime.fromisoformat(session_data["start_at"].replace("Z", "+00:00"))
        duration_sec = int((now - start_at).total_seconds())
        
        # Update session
        session_data["end_at"] = now.isoformat()
        session_data["duration_sec"] = duration_sec
        session_data["status"] = "COMPLETED"
        session_data["updated_at"] = now.isoformat()
        
        # Remove from Redis
        if redis:
            redis.delete(session_key)
        
        # Update in MongoDB
        if self._db is not None:
            await self._db.presence_sessions.update_one(
                {"id": session_data["id"]},
                {"$set": {
                    "end_at": session_data["end_at"],
                    "duration_sec": duration_sec,
                    "status": "COMPLETED",
                    "updated_at": session_data["updated_at"]
                }}
            )
        
        logger.info(f"Closed presence session {session_data['id']} for sensor {sensor_id}, "
                   f"duration: {duration_sec}s ({self._format_duration(duration_sec)})")
        
        return session_data
    
    # ==================== Query Methods ====================
    
    async def get_active_sessions(
        self,
        tenant_id: str,
        building_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all currently active sessions"""
        if self._db is None:
            return []
        
        query = {"tenant_id": tenant_id, "status": "ACTIVE"}
        if building_id:
            query["building_id"] = building_id
        
        sessions = await self._db.presence_sessions.find(
            query, {"_id": 0}
        ).sort("start_at", -1).to_list(500)
        
        # Enrich with current duration
        now = datetime.now(timezone.utc)
        for session in sessions:
            start_at = datetime.fromisoformat(session["start_at"].replace("Z", "+00:00"))
            session["current_duration_sec"] = int((now - start_at).total_seconds())
            session["current_duration_display"] = self._format_duration(session["current_duration_sec"])
        
        return sessions
    
    async def get_sessions(
        self,
        tenant_id: str,
        sensor_id: Optional[str] = None,
        building_id: Optional[str] = None,
        room_id: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Get presence sessions with filters"""
        if self._db is None:
            return []
        
        query = {}
        
        # Only filter by tenant_id if specified (SUPER_ADMIN passes None to see all)
        if tenant_id is not None:
            query["tenant_id"] = tenant_id
        
        if sensor_id:
            query["sensor_id"] = sensor_id
        if building_id:
            query["building_id"] = building_id
        if room_id:
            query["room_id"] = room_id
        if status:
            query["status"] = status
        
        # Date range filter
        if date_from or date_to:
            query["start_at"] = {}
            if date_from:
                query["start_at"]["$gte"] = date_from.isoformat()
            if date_to:
                query["start_at"]["$lte"] = date_to.isoformat()
        
        sessions = await self._db.presence_sessions.find(
            query, {"_id": 0}
        ).sort("start_at", -1).skip(skip).limit(limit).to_list(limit)
        
        # Enrich with formatted duration
        for session in sessions:
            if session.get("duration_sec"):
                session["duration_display"] = self._format_duration(session["duration_sec"])
            elif session.get("status") == "ACTIVE":
                now = datetime.now(timezone.utc)
                start_at = datetime.fromisoformat(session["start_at"].replace("Z", "+00:00"))
                current_duration = int((now - start_at).total_seconds())
                session["current_duration_sec"] = current_duration
                session["duration_display"] = self._format_duration(current_duration) + " (en cours)"
        
        return sessions
    
    async def get_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific session by ID"""
        if self._db is None:
            return None
        
        return await self._db.presence_sessions.find_one(
            {"id": session_id}, {"_id": 0}
        )
    
    async def get_session_stats(
        self,
        tenant_id: str,
        building_id: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get aggregated statistics for presence sessions"""
        if self._db is None:
            return {}
        
        # Build match stage
        match_stage = {"tenant_id": tenant_id, "status": "COMPLETED"}
        if building_id:
            match_stage["building_id"] = building_id
        if date_from:
            match_stage["start_at"] = {"$gte": date_from.isoformat()}
        if date_to:
            if "start_at" in match_stage:
                match_stage["start_at"]["$lte"] = date_to.isoformat()
            else:
                match_stage["start_at"] = {"$lte": date_to.isoformat()}
        
        # Aggregation pipeline
        pipeline = [
            {"$match": match_stage},
            {"$group": {
                "_id": None,
                "total_sessions": {"$sum": 1},
                "total_duration_sec": {"$sum": "$duration_sec"},
                "avg_duration_sec": {"$avg": "$duration_sec"},
                "min_duration_sec": {"$min": "$duration_sec"},
                "max_duration_sec": {"$max": "$duration_sec"}
            }}
        ]
        
        result = await self._db.presence_sessions.aggregate(pipeline).to_list(1)
        
        if not result:
            return {
                "total_sessions": 0,
                "total_duration_sec": 0,
                "avg_duration_sec": 0,
                "min_duration_sec": 0,
                "max_duration_sec": 0,
                "total_duration_display": "0s",
                "avg_duration_display": "0s"
            }
        
        stats = result[0]
        del stats["_id"]
        
        # Add formatted durations
        stats["total_duration_display"] = self._format_duration(stats.get("total_duration_sec", 0))
        stats["avg_duration_display"] = self._format_duration(int(stats.get("avg_duration_sec", 0)))
        stats["min_duration_display"] = self._format_duration(stats.get("min_duration_sec", 0))
        stats["max_duration_display"] = self._format_duration(stats.get("max_duration_sec", 0))
        
        # Get active sessions count
        active_count = await self._db.presence_sessions.count_documents({
            "tenant_id": tenant_id,
            "status": "ACTIVE",
            **({"building_id": building_id} if building_id else {})
        })
        stats["active_sessions"] = active_count
        
        return stats
    
    async def get_daily_stats(
        self,
        tenant_id: str,
        building_id: Optional[str] = None,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """Get daily session statistics"""
        if self._db is None:
            return []
        
        # Build match stage
        match_stage = {"tenant_id": tenant_id, "status": "COMPLETED"}
        if building_id:
            match_stage["building_id"] = building_id
        
        # Calculate date range
        now = datetime.now(timezone.utc)
        from_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        from_date = from_date.replace(day=from_date.day - days + 1)
        match_stage["start_at"] = {"$gte": from_date.isoformat()}
        
        # Aggregation pipeline - group by date
        pipeline = [
            {"$match": match_stage},
            {"$addFields": {
                "date": {"$substr": ["$start_at", 0, 10]}
            }},
            {"$group": {
                "_id": "$date",
                "sessions_count": {"$sum": 1},
                "total_duration_sec": {"$sum": "$duration_sec"},
                "avg_duration_sec": {"$avg": "$duration_sec"}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        results = await self._db.presence_sessions.aggregate(pipeline).to_list(days)
        
        # Format results
        daily_stats = []
        for r in results:
            daily_stats.append({
                "date": r["_id"],
                "sessions_count": r["sessions_count"],
                "total_duration_sec": r["total_duration_sec"],
                "avg_duration_sec": int(r["avg_duration_sec"]),
                "total_duration_display": self._format_duration(r["total_duration_sec"]),
                "avg_duration_display": self._format_duration(int(r["avg_duration_sec"]))
            })
        
        return daily_stats
    
    # ==================== Utility Methods ====================
    
    def _format_duration(self, seconds: int) -> str:
        """Format duration in seconds to human readable string"""
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            minutes = seconds // 60
            secs = seconds % 60
            return f"{minutes}m {secs}s" if secs else f"{minutes}m"
        else:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            return f"{hours}h {minutes}m" if minutes else f"{hours}h"


# Global instance
_presence_session_service: Optional[PresenceSessionService] = None


def get_presence_session_service() -> PresenceSessionService:
    """Get or create the global PresenceSessionService instance"""
    global _presence_session_service
    if _presence_session_service is None:
        _presence_session_service = PresenceSessionService()
    return _presence_session_service


def init_presence_session_service(db: AsyncIOMotorDatabase) -> PresenceSessionService:
    """Initialize the service with MongoDB reference"""
    service = get_presence_session_service()
    service.set_db(db)
    return service
