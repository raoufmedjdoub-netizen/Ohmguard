"""
AI Sensor Service
Service for managing Seedoo AI camera sensors and events
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class AISensorService:
    """Service for AI Sensor operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # ==================== AI SENSORS ====================
    
    async def get_all_sensors(self, client_id: Optional[str] = None) -> List[Dict]:
        """Get all AI sensors with optional client filter"""
        query = {}
        if client_id:
            query["client_id"] = client_id
        
        sensors = await self.db.ai_sensors.find(query, {"_id": 0}).to_list(1000)
        
        # Enrich with location info
        for sensor in sensors:
            sensor["location_path"] = await self._build_location_path(sensor)
        
        return sensors
    
    async def get_sensor(self, sensor_id: str) -> Optional[Dict]:
        """Get a single AI sensor by ID"""
        sensor = await self.db.ai_sensors.find_one({"id": sensor_id}, {"_id": 0})
        if sensor:
            sensor["location_path"] = await self._build_location_path(sensor)
        return sensor
    
    async def get_sensor_by_channel(self, channel: str) -> Optional[Dict]:
        """Get AI sensor by channel identifier"""
        return await self.db.ai_sensors.find_one({"channel": channel}, {"_id": 0})
    
    async def get_sensor_by_channel_name(self, channel_name: str) -> Optional[Dict]:
        """Get AI sensor by channel_name (fallback when channel from topic is unavailable)"""
        return await self.db.ai_sensors.find_one({"channel_name": channel_name}, {"_id": 0})
    
    async def create_sensor(self, data: Dict) -> Dict:
        """Create a new AI sensor"""
        now = datetime.now(timezone.utc).isoformat()
        
        sensor = {
            "id": str(uuid.uuid4()),
            "channel": data["channel"],
            "channel_name": data.get("channel_name", ""),
            "name": data.get("name") or data.get("channel_name", "AI Sensor"),
            "status": "OFFLINE",
            "confidence_threshold": data.get("confidence_threshold", 0.5),
            "confidence_filter_enabled": data.get("confidence_filter_enabled", False),
            "enabled_warnings": data.get("enabled_warnings", []),
            # Seuils de confiance par type d'alerte
            "warning_thresholds": data.get("warning_thresholds", {
                "Fall_Detected": 0.5,
                "Violence_Detected": 0.5,
                "Unattended_Bag": 0.5,
                "Open_Door": 0.5,
            }),
            "push_notifications_enabled": data.get("push_notifications_enabled", True),
            "client_id": data.get("client_id"),
            "building_id": data.get("building_id"),
            "floor_id": data.get("floor_id"),
            "room_id": data.get("room_id"),
            "last_seen": None,
            "last_event_id": None,
            "event_count": 0,
            "created_at": now,
            "updated_at": now
        }
        
        await self.db.ai_sensors.insert_one(sensor)
        sensor.pop("_id", None)
        
        logger.info(f"Created AI sensor: {sensor['id']} ({sensor['channel']})")
        return sensor
    
    async def update_sensor(self, sensor_id: str, data: Dict) -> Optional[Dict]:
        """Update an AI sensor"""
        update_data = {k: v for k, v in data.items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = await self.db.ai_sensors.update_one(
            {"id": sensor_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return await self.get_sensor(sensor_id)
        return None
    
    async def delete_sensor(self, sensor_id: str) -> bool:
        """Delete an AI sensor"""
        result = await self.db.ai_sensors.delete_one({"id": sensor_id})
        return result.deleted_count > 0
    
    async def update_sensor_status(self, channel: str, status: str, last_event_id: Optional[str] = None):
        """Update sensor status and last seen timestamp"""
        now = datetime.now(timezone.utc).isoformat()
        update = {
            "status": status,
            "last_seen": now,
            "updated_at": now
        }
        if last_event_id:
            update["last_event_id"] = last_event_id
            update["$inc"] = {"event_count": 1}
        
        # Use $inc separately
        inc_update = {}
        if last_event_id:
            inc_update["event_count"] = 1
            del update["$inc"]
        
        await self.db.ai_sensors.update_one(
            {"channel": channel},
            {"$set": update, "$inc": inc_update} if inc_update else {"$set": update}
        )
    
    # ==================== AI EVENTS ====================
    
    async def create_event(self, data: Dict) -> Dict:
        """Create a new AI event from MQTT message"""
        now = datetime.now(timezone.utc).isoformat()
        
        # Find the sensor by channel, fallback to channel_name
        channel = data.get("channel", "")
        channel_name = data.get("channel_name", "")
        sensor = await self.get_sensor_by_channel(channel) if channel else None
        if not sensor and channel_name:
            sensor = await self.get_sensor_by_channel_name(channel_name)
        
        # Determine severity based on warning type
        warning_type = data.get("warning_type", "Unknown")
        high_severity = ["Fall_Detected", "Violence", "Fire", "Smoke", "Intrusion"]
        medium_severity = ["Loitering", "Person_Detected"]
        
        if warning_type in high_severity:
            severity = "HIGH"
        elif warning_type in medium_severity:
            severity = "MEDIUM"
        else:
            severity = "LOW"
        
        # warning_id is integer per Seedoo schema
        raw_warning_id = data.get("warning_id")
        warning_id = int(raw_warning_id) if raw_warning_id is not None else None
        
        event = {
            "id": str(uuid.uuid4()),
            "warning_id": warning_id,
            "channel": channel or None,
            "channel_name": channel_name or None,
            "model_id": data.get("model_id"),
            "model_name": data.get("model_name"),
            "timestamp": data.get("timestamp"),
            "seedoo_created_at": data.get("created_at"),
            "warning_type": warning_type,
            "warning_text": data.get("warning_text"),
            "confidence": data.get("confidence", 0),
            "is_warning": data.get("is_warning", False),
            "video_paths": data.get("video_paths", []),
            "video_url": data.get("video_url"),
            "analysis_source": data.get("analysis_source"),
            "sensor_id": sensor["id"] if sensor else None,
            "client_id": sensor.get("client_id") if sensor else None,
            "building_id": sensor.get("building_id") if sensor else None,
            "floor_id": sensor.get("floor_id") if sensor else None,
            "room_id": sensor.get("room_id") if sensor else None,
            "location_path": await self._build_location_path(sensor) if sensor else None,
            "severity": severity,
            "status": "NEW",
            "acknowledged_by": None,
            "acknowledged_at": None,
            "created_at": now
        }
        
        await self.db.ai_events.insert_one(event)
        
        # Update sensor status
        if sensor:
            await self.update_sensor_status(data.get("channel"), "ONLINE", event["id"])
        
        logger.info(f"Created AI event: {event['id']} (type: {warning_type}, confidence: {event['confidence']})")
        
        # Remove MongoDB _id before returning
        event.pop("_id", None)
        return event
    
    async def get_events(
        self,
        sensor_id: Optional[str] = None,
        client_id: Optional[str] = None,
        warning_type: Optional[str] = None,
        status: Optional[str] = None,
        min_confidence: Optional[float] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict]:
        """Get AI events with filters"""
        query = {}
        
        if sensor_id:
            query["sensor_id"] = sensor_id
        if client_id:
            query["client_id"] = client_id
        if warning_type:
            query["warning_type"] = warning_type
        if status:
            query["status"] = status
        if min_confidence is not None:
            query["confidence"] = {"$gte": min_confidence}
        
        events = await self.db.ai_events.find(query, {"_id": 0})\
            .sort("timestamp", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(limit)
        
        return events
    
    async def get_event(self, event_id: str) -> Optional[Dict]:
        """Get a single AI event"""
        return await self.db.ai_events.find_one({"id": event_id}, {"_id": 0})
    
    async def update_event_status(self, event_id: str, status: str, user_id: str) -> Optional[Dict]:
        """Update event status (acknowledge, resolve, etc.)"""
        now = datetime.now(timezone.utc).isoformat()
        
        update = {"status": status}
        if status == "ACKNOWLEDGED":
            update["acknowledged_by"] = user_id
            update["acknowledged_at"] = now
        
        result = await self.db.ai_events.update_one(
            {"id": event_id},
            {"$set": update}
        )
        
        if result.modified_count > 0:
            return await self.get_event(event_id)
        return None
    
    async def count_events(self, **filters) -> int:
        """Count AI events with filters"""
        query = {k: v for k, v in filters.items() if v is not None}
        return await self.db.ai_events.count_documents(query)
    
    async def get_recent_events(self, limit: int = 10) -> List[Dict]:
        """Get most recent AI events for dashboard"""
        return await self.db.ai_events.find({}, {"_id": 0})\
            .sort("timestamp", -1)\
            .limit(limit)\
            .to_list(limit)
    
    async def clear_events(self) -> int:
        """Clear all AI events"""
        result = await self.db.ai_events.delete_many({})
        logger.info(f"Cleared {result.deleted_count} AI events")
        return result.deleted_count
    
    # ==================== HELPERS ====================
    
    async def _build_location_path(self, sensor: Optional[Dict]) -> Optional[str]:
        """Build location path string for a sensor"""
        if not sensor:
            return None
        
        parts = []
        
        if sensor.get("client_id"):
            client = await self.db.clients.find_one({"id": sensor["client_id"]}, {"_id": 0, "name": 1})
            if client:
                parts.append(client["name"])
        
        if sensor.get("building_id"):
            building = await self.db.buildings.find_one({"id": sensor["building_id"]}, {"_id": 0, "name": 1})
            if building:
                parts.append(building["name"])
        
        if sensor.get("floor_id"):
            floor = await self.db.floors.find_one({"id": sensor["floor_id"]}, {"_id": 0, "name": 1})
            if floor:
                parts.append(floor["name"])
        
        if sensor.get("room_id"):
            room = await self.db.rooms.find_one({"id": sensor["room_id"]}, {"_id": 0, "name": 1})
            if room:
                parts.append(room["name"])
        
        return " > ".join(parts) if parts else None
    
    async def get_or_create_sensor(self, channel: str, channel_name: str) -> Dict:
        """Get existing sensor or create new one. Uses channel first, falls back to channel_name."""
        sensor = await self.get_sensor_by_channel(channel) if channel else None
        if not sensor and channel_name:
            sensor = await self.get_sensor_by_channel_name(channel_name)
        if not sensor:
            sensor = await self.create_sensor({
                "channel": channel,
                "channel_name": channel_name
            })
        return sensor


# Global service instance
ai_sensor_service: Optional[AISensorService] = None


def init_ai_sensor_service(db: AsyncIOMotorDatabase) -> AISensorService:
    """Initialize the AI sensor service"""
    global ai_sensor_service
    ai_sensor_service = AISensorService(db)
    return ai_sensor_service


def get_ai_sensor_service() -> AISensorService:
    """Get the AI sensor service instance"""
    if ai_sensor_service is None:
        raise RuntimeError("AISensorService not initialized")
    return ai_sensor_service
