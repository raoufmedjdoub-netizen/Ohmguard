"""
Vayyar Configuration Service
Handles MQTT publish/subscribe for device configuration and version management
"""

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Callable
from motor.motor_asyncio import AsyncIOMotorDatabase

import aiomqtt

from vayyar_config_schema import (
    VayyarConfig, ConfigVersionResponse, ConfigVersionStatus,
    MqttPublishOptions, get_default_config_dict
)

logger = logging.getLogger(__name__)


class VayyarConfigService:
    """Service for managing Vayyar radar configurations"""
    
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        broker_host: str,
        broker_port: int,
        pub_topic_pattern: str = "devices/{deviceId}/config",
        ack_topic_pattern: str = "devices/{deviceId}/config/ack",
        default_qos: int = 1,
        ack_timeout_sec: int = 60,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        self.db = db
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.pub_topic_pattern = pub_topic_pattern
        self.ack_topic_pattern = ack_topic_pattern
        self.default_qos = default_qos
        self.ack_timeout_sec = ack_timeout_sec
        self.username = username
        self.password = password
        
        self.running = False
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[aiomqtt.Client] = None
        
        # Pending ACKs: correlationId -> version_id
        self._pending_acks: Dict[str, str] = {}
        self._ack_callbacks: Dict[str, Callable] = {}
        
        # WebSocket broadcast callback
        self.broadcast_callback: Optional[Callable] = None
    
    def set_broadcast_callback(self, callback: Callable):
        """Set callback for WebSocket broadcasts"""
        self.broadcast_callback = callback
    
    def _get_pub_topic(self, device_id: str) -> str:
        """Get publish topic for device"""
        return self.pub_topic_pattern.replace("{deviceId}", device_id)
    
    def _get_ack_topic(self, device_id: str) -> str:
        """Get ACK topic for device"""
        return self.ack_topic_pattern.replace("{deviceId}", device_id)
    
    async def start(self):
        """Start the config service ACK listener"""
        if self.running:
            logger.warning("Config service already running")
            return
        
        self.running = True
        self._task = asyncio.create_task(self._run_ack_listener())
        logger.info(f"Vayyar Config Service started")
    
    async def stop(self):
        """Stop the config service"""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Vayyar Config Service stopped")
    
    async def _run_ack_listener(self):
        """Listen for ACK messages"""
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
                    
                    # Subscribe to ACK topics (wildcard)
                    ack_pattern = self.ack_topic_pattern.replace("{deviceId}", "+")
                    await client.subscribe(ack_pattern)
                    logger.info(f"Config Service subscribed to ACK topic: {ack_pattern}")
                    
                    async for message in client.messages:
                        try:
                            await self._handle_ack_message(message)
                        except Exception as e:
                            logger.error(f"Error handling ACK: {e}", exc_info=True)
                            
            except aiomqtt.MqttError as e:
                logger.error(f"MQTT error in config service: {e}")
                await asyncio.sleep(reconnect_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected error in config service: {e}", exc_info=True)
                await asyncio.sleep(reconnect_interval)
    
    async def _handle_ack_message(self, message):
        """Handle incoming ACK message"""
        topic = str(message.topic)
        
        try:
            payload = json.loads(message.payload.decode())
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in ACK: {topic}")
            return
        
        # Extract deviceId from topic
        parts = topic.split('/')
        if len(parts) < 4:
            return
        
        device_id = parts[1]
        correlation_id = payload.get("correlationId")
        
        logger.info(f"Received ACK from {device_id}: {payload}")
        
        # Find the version to update
        version = None
        if correlation_id and correlation_id in self._pending_acks:
            version_id = self._pending_acks.pop(correlation_id)
            version = await self.db.config_versions.find_one({"id": version_id})
        else:
            # Find latest SENT version for this device
            version = await self.db.config_versions.find_one(
                {"deviceId": device_id, "status": ConfigVersionStatus.SENT.value},
                sort=[("sentAt", -1)]
            )
        
        if version:
            # Update version status
            is_ok = payload.get("ok", payload.get("success", True))
            new_status = ConfigVersionStatus.ACKED.value if is_ok else ConfigVersionStatus.FAILED.value
            
            await self.db.config_versions.update_one(
                {"id": version["id"]},
                {"$set": {
                    "status": new_status,
                    "ackAt": datetime.now(timezone.utc).isoformat(),
                    "ackPayload": payload
                }}
            )
            
            logger.info(f"Updated config version {version['id']} to {new_status}")
            
            # Broadcast update
            if self.broadcast_callback:
                await self.broadcast_callback(version.get("tenantId"), {
                    "type": "config_ack",
                    "deviceId": device_id,
                    "versionId": version["id"],
                    "status": new_status,
                    "ackPayload": payload
                })
    
    async def publish_config(
        self,
        device_id: str,
        config: dict,
        options: MqttPublishOptions,
        tenant_id: Optional[str] = None
    ) -> ConfigVersionResponse:
        """Publish configuration to device via MQTT"""
        
        # Generate correlation ID if not provided
        correlation_id = options.correlationId or str(uuid.uuid4())
        
        # Get topic
        pub_topic = options.topic or self._get_pub_topic(device_id)
        ack_topic = self._get_ack_topic(device_id)
        
        # Get next version number
        last_version = await self.db.config_versions.find_one(
            {"deviceId": device_id},
            sort=[("versionNumber", -1)]
        )
        version_number = (last_version["versionNumber"] + 1) if last_version else 1
        
        # Create version record
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        version_doc = {
            "id": version_id,
            "deviceId": device_id,
            "tenantId": tenant_id,
            "versionNumber": version_number,
            "config": config,
            "status": ConfigVersionStatus.SENT.value,
            "sentAt": now,
            "ackAt": None,
            "ackPayload": None,
            "correlationId": correlation_id,
            "pubTopic": pub_topic,
            "ackTopic": ack_topic,
            "qos": options.qos,
            "retain": options.retain,
            "createdAt": now
        }
        
        await self.db.config_versions.insert_one(version_doc)
        
        # Track pending ACK
        self._pending_acks[correlation_id] = version_id
        
        # Prepare MQTT payload (add correlationId to envelope if desired)
        mqtt_payload = {
            **config,
            "_meta": {
                "correlationId": correlation_id,
                "sentAt": now,
                "versionNumber": version_number
            }
        }
        
        # Publish via MQTT
        try:
            async with aiomqtt.Client(
                hostname=self.broker_host,
                port=self.broker_port,
                username=self.username,
                password=self.password
            ) as client:
                await client.publish(
                    pub_topic,
                    json.dumps(mqtt_payload).encode('utf-8'),
                    qos=options.qos,
                    retain=options.retain
                )
            
            logger.info(f"Published config v{version_number} to {pub_topic}")
            
        except Exception as e:
            logger.error(f"Failed to publish config: {e}")
            await self.db.config_versions.update_one(
                {"id": version_id},
                {"$set": {"status": ConfigVersionStatus.FAILED.value}}
            )
            raise
        
        # Schedule timeout check
        asyncio.create_task(self._check_ack_timeout(version_id, correlation_id))
        
        # Broadcast
        if self.broadcast_callback and tenant_id:
            await self.broadcast_callback(tenant_id, {
                "type": "config_sent",
                "deviceId": device_id,
                "versionId": version_id,
                "versionNumber": version_number
            })
        
        return ConfigVersionResponse(
            id=version_id,
            deviceId=device_id,
            versionNumber=version_number,
            config=config,
            status=ConfigVersionStatus.SENT.value,
            sentAt=now,
            correlationId=correlation_id,
            pubTopic=pub_topic,
            ackTopic=ack_topic,
            qos=options.qos,
            retain=options.retain,
            createdAt=now
        )
    
    async def _check_ack_timeout(self, version_id: str, correlation_id: str):
        """Check for ACK timeout and update status"""
        await asyncio.sleep(self.ack_timeout_sec)
        
        if correlation_id in self._pending_acks:
            self._pending_acks.pop(correlation_id, None)
            
            # Check if still in SENT status
            version = await self.db.config_versions.find_one({"id": version_id})
            if version and version["status"] == ConfigVersionStatus.SENT.value:
                await self.db.config_versions.update_one(
                    {"id": version_id},
                    {"$set": {"status": ConfigVersionStatus.TIMEOUT.value}}
                )
                logger.warning(f"Config version {version_id} timed out")
    
    async def get_latest_config(self, device_id: str) -> Optional[dict]:
        """Get latest configuration for a device"""
        version = await self.db.config_versions.find_one(
            {"deviceId": device_id},
            sort=[("versionNumber", -1)],
            projection={"_id": 0}
        )
        return version
    
    async def get_config_versions(
        self,
        device_id: str,
        limit: int = 20,
        skip: int = 0
    ) -> List[dict]:
        """Get configuration versions for a device"""
        cursor = self.db.config_versions.find(
            {"deviceId": device_id},
            projection={"_id": 0}
        ).sort("versionNumber", -1).skip(skip).limit(limit)
        
        return await cursor.to_list(limit)
    
    async def rollback_to_version(
        self,
        device_id: str,
        version_number: int,
        tenant_id: Optional[str] = None
    ) -> ConfigVersionResponse:
        """Rollback to a specific version"""
        version = await self.db.config_versions.find_one({
            "deviceId": device_id,
            "versionNumber": version_number
        })
        
        if not version:
            raise ValueError(f"Version {version_number} not found for device {device_id}")
        
        # Republish the config
        options = MqttPublishOptions(
            qos=version.get("qos", 1),
            retain=version.get("retain", False)
        )
        
        return await self.publish_config(
            device_id,
            version["config"],
            options,
            tenant_id
        )
    
    async def retry_send(self, version_id: str) -> ConfigVersionResponse:
        """Retry sending a failed/timed out config"""
        version = await self.db.config_versions.find_one({"id": version_id})
        
        if not version:
            raise ValueError(f"Version {version_id} not found")
        
        if version["status"] not in [ConfigVersionStatus.FAILED.value, ConfigVersionStatus.TIMEOUT.value]:
            raise ValueError(f"Cannot retry version with status {version['status']}")
        
        options = MqttPublishOptions(
            qos=version.get("qos", 1),
            retain=version.get("retain", False)
        )
        
        return await self.publish_config(
            version["deviceId"],
            version["config"],
            options,
            version.get("tenantId")
        )
    
    # Template Management
    async def create_template(
        self,
        name: str,
        config: dict,
        description: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> dict:
        """Create a configuration template"""
        template = {
            "id": str(uuid.uuid4()),
            "name": name,
            "description": description,
            "config": config,
            "tenantId": tenant_id,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.config_templates.insert_one(template)
        return {k: v for k, v in template.items() if k != "_id"}
    
    async def get_templates(self, tenant_id: Optional[str] = None) -> List[dict]:
        """Get all configuration templates"""
        query = {}
        if tenant_id:
            query["$or"] = [{"tenantId": tenant_id}, {"tenantId": None}]
        
        cursor = self.db.config_templates.find(query, projection={"_id": 0})
        return await cursor.to_list(100)
    
    async def get_template(self, template_id: str) -> Optional[dict]:
        """Get a specific template"""
        return await self.db.config_templates.find_one(
            {"id": template_id},
            projection={"_id": 0}
        )
    
    async def delete_template(self, template_id: str) -> bool:
        """Delete a template"""
        result = await self.db.config_templates.delete_one({"id": template_id})
        return result.deleted_count > 0


# Global service instance
vayyar_config_service: Optional[VayyarConfigService] = None


async def init_vayyar_config_service(
    db: AsyncIOMotorDatabase,
    broker_host: str,
    broker_port: int
) -> VayyarConfigService:
    """Initialize the Vayyar config service"""
    global vayyar_config_service
    
    vayyar_config_service = VayyarConfigService(
        db=db,
        broker_host=broker_host,
        broker_port=broker_port,
        pub_topic_pattern=os.environ.get("MQTT_PUB_TOPIC", "/devices/{deviceId}/config"),
        ack_topic_pattern=os.environ.get("MQTT_ACK_TOPIC", "/devices/{deviceId}/config/ack"),
        default_qos=int(os.environ.get("MQTT_QOS", "1")),
        ack_timeout_sec=int(os.environ.get("MQTT_ACK_TIMEOUT", "60"))
    )
    
    await vayyar_config_service.start()
    return vayyar_config_service


async def stop_vayyar_config_service():
    """Stop the Vayyar config service"""
    global vayyar_config_service
    if vayyar_config_service:
        await vayyar_config_service.stop()
        vayyar_config_service = None
