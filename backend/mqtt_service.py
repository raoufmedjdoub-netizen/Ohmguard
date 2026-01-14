"""
MQTT Service for Vayyar Radar Integration
Connects to MQTT broker and processes fall detection events from radar devices
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Callable, Dict, Any
import uuid

import aiomqtt
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Vayyar event type mapping
VAYYAR_EVENT_TYPES = {
    0: "PRESENCE",      # Presence detection
    1: "ENTRY",         # Room entry
    2: "EXIT",          # Room exit
    3: "PRE_FALL",      # Pre-fall detected (posture change)
    4: "FALL",          # Fall detected
    5: "LYING",         # Person lying down
    6: "SITTING",       # Person sitting
    7: "STANDING",      # Person standing
    8: "WALKING",       # Person walking
}

# Posture mapping from trackerTargets
POSTURE_MAP = {
    0: "STANDING",
    1: "SITTING", 
    2: "LYING",
    3: "FALLING",
}

# Device status mapping
DEVICE_STATUS_MAP = {
    "monitoring": "ONLINE",
    "idle": "ONLINE",
    "offline": "OFFLINE",
    "error": "MAINTENANCE",
    "calibrating": "MAINTENANCE",
}


class MQTTService:
    """MQTT Service for Vayyar radar integration"""
    
    def __init__(
        self,
        broker_host: str,
        broker_port: int,
        db: AsyncIOMotorDatabase,
        broadcast_callback: Optional[Callable] = None,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.db = db
        self.broadcast_callback = broadcast_callback
        self.username = username
        self.password = password
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[aiomqtt.Client] = None
        
        # Cache for device to sensor mapping
        self._device_sensor_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 300  # 5 minutes cache
        self._cache_timestamp: Dict[str, datetime] = {}
    
    async def start(self):
        """Start the MQTT service"""
        if self.running:
            logger.warning("MQTT service is already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run())
        logger.info(f"MQTT service started, connecting to {self.broker_host}:{self.broker_port}")
    
    async def stop(self):
        """Stop the MQTT service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("MQTT service stopped")
    
    async def _run(self):
        """Main MQTT loop with reconnection logic"""
        reconnect_interval = 5
        
        while self.running:
            try:
                async with aiomqtt.Client(
                    hostname=self.broker_host,
                    port=self.broker_port,
                    username=self.username,
                    password=self.password,
                    keepalive=60
                ) as client:
                    self._client = client
                    logger.info(f"Connected to MQTT broker {self.broker_host}:{self.broker_port}")
                    
                    # Subscribe to device topics
                    await client.subscribe("/devices/+/state")
                    await client.subscribe("/devices/+/event")
                    logger.info("Subscribed to /devices/+/state and /devices/+/event")
                    
                    # Process messages
                    async for message in client.messages:
                        try:
                            await self._handle_message(message)
                        except Exception as e:
                            logger.error(f"Error handling MQTT message: {e}", exc_info=True)
                            
            except aiomqtt.MqttError as e:
                logger.error(f"MQTT connection error: {e}. Reconnecting in {reconnect_interval}s...")
                await asyncio.sleep(reconnect_interval)
            except asyncio.CancelledError:
                logger.info("MQTT service cancelled")
                break
            except Exception as e:
                logger.error(f"Unexpected MQTT error: {e}. Reconnecting in {reconnect_interval}s...", exc_info=True)
                await asyncio.sleep(reconnect_interval)
    
    async def _handle_message(self, message):
        """Handle incoming MQTT message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON payload on topic {topic}")
            return
        
        # Extract deviceId from topic: /devices/{deviceId}/state or /devices/{deviceId}/event
        parts = topic.split('/')
        if len(parts) < 4:
            logger.warning(f"Invalid topic format: {topic}")
            return
        
        device_id = parts[2]
        message_type = parts[3]  # "state" or "event"
        
        logger.debug(f"Received {message_type} from device {device_id}")
        
        if message_type == "state":
            await self._handle_device_state(device_id, payload)
        elif message_type == "event":
            await self._handle_device_event(device_id, payload)
    
    async def _get_sensor_by_device_id(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get sensor info from database by device_id (with caching)"""
        now = datetime.now(timezone.utc)
        
        # Check cache
        if device_id in self._device_sensor_cache:
            cache_time = self._cache_timestamp.get(device_id)
            if cache_time and (now - cache_time).total_seconds() < self._cache_ttl:
                return self._device_sensor_cache[device_id]
        
        # Query database - look for sensor with matching device_id in name or model
        sensor = await self.db.sensors.find_one(
            {"$or": [
                {"model": device_id},
                {"name": {"$regex": device_id, "$options": "i"}},
                {"firmware": device_id}
            ]},
            {"_id": 0}
        )
        
        if sensor:
            self._device_sensor_cache[device_id] = sensor
            self._cache_timestamp[device_id] = now
            logger.info(f"Mapped device {device_id} to sensor {sensor['id']}")
        
        return sensor
    
    async def _auto_register_sensor(self, device_id: str, payload: Dict) -> Optional[Dict[str, Any]]:
        """Auto-register a new sensor from MQTT device"""
        # Get default tenant and site for auto-registration
        tenant = await self.db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            logger.warning(f"No tenant found for auto-registration of device {device_id}")
            return None
        
        site = await self.db.sites.find_one({"tenant_id": tenant['id']}, {"_id": 0})
        if not site:
            logger.warning(f"No site found for auto-registration of device {device_id}")
            return None
        
        zone = await self.db.zones.find_one({"site_id": site['id']}, {"_id": 0})
        if not zone:
            # Create a default zone
            zone = {
                "id": str(uuid.uuid4()),
                "name": "Zone Auto",
                "site_id": site['id'],
                "floor": "RDC",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await self.db.zones.insert_one(zone)
        
        # Create sensor
        model_info = payload.get("model", "Vayyar Radar")
        sensor = {
            "id": str(uuid.uuid4()),
            "name": f"Radar Vayyar - {device_id[:8]}",
            "type": "RADAR",
            "model": device_id,
            "firmware": payload.get("versionName", "unknown"),
            "zone_id": zone['id'],
            "site_id": site['id'],
            "tenant_id": tenant['id'],
            "api_key": f"sk_{uuid.uuid4().hex}",
            "status": "ONLINE",
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.sensors.insert_one(sensor)
        
        # Cache it
        self._device_sensor_cache[device_id] = sensor
        self._cache_timestamp[device_id] = datetime.now(timezone.utc)
        
        logger.info(f"Auto-registered new sensor for device {device_id}: {sensor['id']}")
        
        # Broadcast new sensor to WebSocket
        if self.broadcast_callback:
            await self.broadcast_callback(tenant['id'], {
                "type": "sensor_registered",
                "sensor": sensor
            })
        
        return sensor
    
    async def _handle_device_state(self, device_id: str, payload: Dict):
        """Handle device state update"""
        sensor = await self._get_sensor_by_device_id(device_id)
        
        if not sensor:
            # Auto-register the sensor
            sensor = await self._auto_register_sensor(device_id, payload)
            if not sensor:
                return
        
        # Update sensor status
        status = payload.get("status", "monitoring")
        new_status = DEVICE_STATUS_MAP.get(status, "ONLINE")
        
        update_data = {
            "status": new_status,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "firmware": payload.get("versionName", sensor.get("firmware")),
        }
        
        # Add extra info
        if "temperature" in payload:
            update_data["temperature"] = payload["temperature"]
        if "memoryUsage" in payload:
            update_data["memory_usage"] = payload["memoryUsage"]
        if "upTime" in payload:
            update_data["uptime"] = payload["upTime"]
        
        await self.db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": update_data}
        )
        
        # Broadcast status update
        if self.broadcast_callback:
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "sensor_status",
                "sensor_id": sensor['id'],
                "device_id": device_id,
                "status": new_status,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        
        logger.debug(f"Updated sensor {sensor['id']} status to {new_status}")
    
    async def _handle_device_event(self, device_id: str, payload: Dict):
        """Handle device event (fall detection, presence, etc.)"""
        sensor = await self._get_sensor_by_device_id(device_id)
        
        if not sensor:
            logger.warning(f"Unknown device {device_id} sent event, attempting auto-registration")
            sensor = await self._auto_register_sensor(device_id, {})
            if not sensor:
                return
        
        event_type_code = payload.get("type", 0)
        event_payload = payload.get("payload", {})
        
        # Determine event type and severity
        event_type = self._determine_event_type(event_type_code, event_payload)
        severity = self._determine_severity(event_type_code, event_payload)
        confidence = self._calculate_confidence(event_payload)
        
        # Skip non-critical events (presence-only)
        if event_type == "PRESENCE" and event_type_code == 0:
            logger.debug(f"Skipping presence-only event from {device_id}")
            return
        
        # Deduplication: check for similar event in last 10 seconds
        ten_seconds_ago = datetime.now(timezone.utc) - __import__('datetime').timedelta(seconds=10)
        existing = await self.db.events.find_one({
            "sensor_id": sensor['id'],
            "type": event_type,
            "timestamp": {"$gte": ten_seconds_ago.isoformat()}
        }, {"_id": 0})
        
        if existing:
            # Update confidence if higher
            if confidence > existing.get('confidence', 0):
                await self.db.events.update_one(
                    {"id": existing['id']},
                    {"$set": {"confidence": confidence, "raw_payload": payload}}
                )
            logger.debug(f"Deduplicated event from {device_id}")
            return
        
        # Create new event
        event = {
            "id": str(uuid.uuid4()),
            "sensor_id": sensor['id'],
            "tenant_id": sensor['tenant_id'],
            "site_id": sensor['site_id'],
            "zone_id": sensor['zone_id'],
            "type": event_type,
            "severity": severity,
            "confidence": confidence,
            "status": "NEW",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "raw_payload": payload,
            "vayyar_event_id": event_payload.get("eventId"),
            "tracker_targets": event_payload.get("trackerTargets", [])
        }
        
        await self.db.events.insert_one(event)
        
        # Update sensor last_seen
        await self.db.sensors.update_one(
            {"id": sensor['id']},
            {"$set": {"status": "ONLINE", "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        
        logger.info(f"Created {event_type} event from device {device_id}, severity: {severity}")
        
        # Broadcast to WebSocket
        if self.broadcast_callback:
            await self.broadcast_callback(sensor['tenant_id'], {
                "type": "new_event",
                "event": event
            })
        
        # Trigger alert rules
        await self._process_alert_rules(event, sensor)
    
    def _determine_event_type(self, event_type_code: int, payload: Dict) -> str:
        """Determine the event type from Vayyar payload"""
        # Check tracker targets for posture
        tracker_targets = payload.get("trackerTargets", [])
        
        for target in tracker_targets:
            posture = target.get("posture", 0)
            if posture == 3:  # Falling
                return "FALL"
            elif posture == 2:  # Lying
                # Could be a fall if sudden
                z_pos = target.get("zPosCm", 100)
                if z_pos < 50:  # Very low position
                    return "FALL"
                return "PRE_FALL"
        
        # Use event type code
        if event_type_code == 4:
            return "FALL"
        elif event_type_code == 3:
            return "PRE_FALL"
        elif event_type_code in [5, 6, 7, 8]:
            return "PRE_FALL"  # Posture changes
        
        return "UNKNOWN"
    
    def _determine_severity(self, event_type_code: int, payload: Dict) -> str:
        """Determine severity based on event type and payload"""
        tracker_targets = payload.get("trackerTargets", [])
        
        # Fall events are always HIGH severity
        if event_type_code == 4:
            return "HIGH"
        
        for target in tracker_targets:
            posture = target.get("posture", 0)
            if posture == 3:  # Falling
                return "HIGH"
            elif posture == 2:  # Lying
                z_pos = target.get("zPosCm", 100)
                if z_pos < 30:
                    return "HIGH"
                return "MED"
        
        if event_type_code == 3:  # Pre-fall
            return "MED"
        
        return "LOW"
    
    def _calculate_confidence(self, payload: Dict) -> float:
        """Calculate confidence score from payload"""
        tracker_targets = payload.get("trackerTargets", [])
        
        if not tracker_targets:
            return 0.5
        
        # Use amplitude as confidence indicator
        max_amplitude = max((t.get("amplitude", 0) for t in tracker_targets), default=0)
        
        # Normalize to 0-1 range (assuming amplitude is 0-100)
        confidence = min(max(max_amplitude / 100, 0.5), 1.0)
        
        return round(confidence, 2)
    
    async def _process_alert_rules(self, event: Dict, sensor: Dict):
        """Process alert rules for a new event"""
        rules = await self.db.alert_rules.find({
            "tenant_id": event['tenant_id'],
            "is_active": True,
            "$or": [
                {"site_id": event['site_id']},
                {"site_id": None}
            ]
        }, {"_id": 0}).to_list(100)
        
        severity_order = {"LOW": 1, "MED": 2, "HIGH": 3}
        
        for rule in rules:
            if event['type'] not in rule.get('event_types', []):
                continue
            if severity_order.get(event['severity'], 0) < severity_order.get(rule.get('min_severity', 'LOW'), 0):
                continue
            
            # Create notification log
            for channel in rule.get('channels', ['in_app']):
                notification = {
                    "id": str(uuid.uuid4()),
                    "event_id": event['id'],
                    "tenant_id": event['tenant_id'],
                    "channel": channel,
                    "recipient": rule.get('name', 'default'),
                    "status": "sent",
                    "message": f"Alerte {event['type']} détectée par {sensor.get('name', 'capteur')}",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await self.db.notification_logs.insert_one(notification)
            
            # Webhook (mock in dev)
            if rule.get('webhook_url'):
                logger.info(f"[MOCK] Webhook to {rule['webhook_url']}: {event}")


# Global MQTT service instance
mqtt_service: Optional[MQTTService] = None


async def init_mqtt_service(
    db: AsyncIOMotorDatabase,
    broadcast_callback: Callable,
    broker_host: str = "38.242.254.49",
    broker_port: int = 1883
) -> MQTTService:
    """Initialize and start the MQTT service"""
    global mqtt_service
    
    mqtt_service = MQTTService(
        broker_host=broker_host,
        broker_port=broker_port,
        db=db,
        broadcast_callback=broadcast_callback
    )
    
    await mqtt_service.start()
    return mqtt_service


async def stop_mqtt_service():
    """Stop the MQTT service"""
    global mqtt_service
    if mqtt_service:
        await mqtt_service.stop()
        mqtt_service = None
