"""
Seedoo MQTT Service
Dedicated MQTT client for Seedoo AI camera events
Connects to a separate MQTT broker for AI camera messages
"""

import asyncio
import json
import logging
from typing import Optional, Callable, Dict, Any
from datetime import datetime, timezone

import aiomqtt
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class SeedooMQTTService:
    """Dedicated MQTT Service for Seedoo AI cameras"""
    
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
        self._message_count = 0
    
    async def start(self):
        """Start the Seedoo MQTT service"""
        if self.running:
            logger.warning("Seedoo MQTT service is already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run())
        logger.info(f"Seedoo MQTT service started, connecting to {self.broker_host}:{self.broker_port}")
    
    async def stop(self):
        """Stop the Seedoo MQTT service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Seedoo MQTT service stopped")
    
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
                    logger.info(f"Connected to Seedoo MQTT broker {self.broker_host}:{self.broker_port}")
                    
                    # Subscribe to Seedoo AI camera topics
                    await client.subscribe("/seedoo/#")
                    logger.info("Subscribed to /seedoo/# (AI cameras)")
                    
                    # Process messages
                    async for message in client.messages:
                        try:
                            await self._handle_message(message)
                        except Exception as e:
                            logger.error(f"Error handling Seedoo MQTT message: {e}", exc_info=True)
                    
            except aiomqtt.MqttError as e:
                logger.error(f"Seedoo MQTT connection error: {e}")
                if self.running:
                    logger.info(f"Reconnecting to Seedoo MQTT in {reconnect_interval} seconds...")
                    await asyncio.sleep(reconnect_interval)
            except Exception as e:
                logger.error(f"Unexpected Seedoo MQTT error: {e}", exc_info=True)
                if self.running:
                    await asyncio.sleep(reconnect_interval)
    
    async def _handle_message(self, message):
        """Handle incoming Seedoo MQTT message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON payload on Seedoo topic {topic}")
            return
        
        self._message_count += 1
        logger.info(f"SEEDOO message #{self._message_count} received on {topic}: warning_type={payload.get('warning_type')}, confidence={payload.get('confidence')}")
        
        # Process the AI event
        await self._handle_seedoo_event(topic, payload)
    
    async def _handle_seedoo_event(self, topic: str, payload: Dict):
        """Handle Seedoo AI camera events"""
        # Extract channel from topic, fallback to channel_name from payload
        parts = topic.split('/')
        channel = parts[2] if len(parts) >= 3 else ""
        channel_name = payload.get("channel_name") or channel or "unknown"
        
        # Import AI sensor service
        try:
            from ai_sensor_service import get_ai_sensor_service
            ai_service = get_ai_sensor_service()
        except Exception as e:
            logger.error(f"Failed to get AI sensor service: {e}")
            return
        
        # Get or create the AI sensor
        channel_name = payload.get("channel_name", channel)
        sensor = await ai_service.get_or_create_sensor(channel, channel_name)
        
        # Check confidence threshold (per warning type or global)
        confidence = payload.get("confidence", 0)
        warning_type = payload.get("warning_type", "Unknown")
        
        # Use per-type threshold if available, otherwise use global threshold
        warning_thresholds = sensor.get("warning_thresholds", {})
        threshold = warning_thresholds.get(warning_type, sensor.get("confidence_threshold", 0.7))
        
        if confidence < threshold:
            logger.debug(f"Ignoring low confidence AI event: {confidence} < {threshold} (type: {warning_type})")
            return
        
        # Check if warning type is enabled
        enabled_warnings = sensor.get("enabled_warnings", [])
        if enabled_warnings and warning_type not in enabled_warnings:
            logger.debug(f"Ignoring disabled warning type: {warning_type}")
            return
        
        # Create the AI event (inject channel from topic into payload)
        event_data = {**payload, "channel": channel}
        event = await ai_service.create_event(event_data)
        
        # Broadcast to WebSocket
        if self.broadcast_callback:
            # Determine severity
            high_severity_types = ["Fall_Detected", "Violence", "Fire", "Smoke", "Intrusion"]
            severity = "HIGH" if warning_type in high_severity_types else "MEDIUM" if warning_type != "Normal_Activity" else "LOW"
            
            # Broadcast the AI event
            await self.broadcast_callback("all", {
                "type": "new_ai_event",
                "event": {
                    **event,
                    "sensor_name": sensor.get("name", channel_name),
                    "severity": severity,
                    "event_source": "ai_camera"
                }
            })
            
            logger.info(f"Broadcasted AI event: {event['id']} (type: {warning_type}, severity: {severity})")
        
        # Send push notifications for critical AI alerts
        critical_types = ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion']
        if warning_type in critical_types and sensor.get("push_notifications_enabled", True):
            await self._send_ai_push_notification(event, sensor, warning_type)
    
    async def _send_ai_push_notification(self, event: Dict, sensor: Dict, warning_type: str):
        """Send push notification for critical AI events"""
        try:
            from push_notification_service import send_expo_push_notification
            
            # Get all push tokens
            tokens_cursor = self.db.push_tokens.find({}, {"_id": 0, "push_token": 1})
            tokens = [doc['push_token'] async for doc in tokens_cursor]
            
            if not tokens:
                logger.debug("No push tokens found for AI notification")
                return
            
            # Build notification message based on warning type
            alert_titles = {
                'Fall_Detected': '🚨 Chute détectée (IA)',
                'Violence': '⚠️ Violence détectée',
                'Fire': '🔥 Feu détecté',
                'Smoke': '💨 Fumée détectée',
                'Intrusion': '🚷 Intrusion détectée'
            }
            
            title = alert_titles.get(warning_type, '⚠️ Alerte IA')
            body = f"{sensor.get('name', event.get('channel_name', 'Caméra'))} - Confiance: {int(event.get('confidence', 0) * 100)}%"
            
            # Send push notification
            result = await send_expo_push_notification(
                tokens=tokens,
                title=title,
                body=body,
                data={
                    "type": "ai_event",
                    "event_id": event.get("id"),
                    "warning_type": warning_type,
                    "video_url": event.get("video_url"),
                    "channel": event.get("channel"),
                    "confidence": event.get("confidence")
                }
            )
            
            if result:
                logger.info(f"AI push notification sent for {warning_type}: {len(tokens)} recipients")
            
        except Exception as e:
            logger.error(f"Failed to send AI push notification: {e}")


# Global service instance
seedoo_mqtt_service: Optional[SeedooMQTTService] = None


async def start_seedoo_mqtt_service(
    broker_host: str,
    broker_port: int,
    db: AsyncIOMotorDatabase,
    broadcast_callback: Optional[Callable] = None,
    username: Optional[str] = None,
    password: Optional[str] = None
) -> SeedooMQTTService:
    """Start the Seedoo MQTT service"""
    global seedoo_mqtt_service
    
    seedoo_mqtt_service = SeedooMQTTService(
        broker_host=broker_host,
        broker_port=broker_port,
        db=db,
        broadcast_callback=broadcast_callback,
        username=username,
        password=password
    )
    
    await seedoo_mqtt_service.start()
    return seedoo_mqtt_service


async def stop_seedoo_mqtt_service():
    """Stop the Seedoo MQTT service"""
    global seedoo_mqtt_service
    
    if seedoo_mqtt_service:
        await seedoo_mqtt_service.stop()
        seedoo_mqtt_service = None


def get_seedoo_mqtt_service() -> Optional[SeedooMQTTService]:
    """Get the Seedoo MQTT service instance"""
    return seedoo_mqtt_service
