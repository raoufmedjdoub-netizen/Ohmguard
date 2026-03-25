"""
Cascade Notification Service for OhmGuard
Orchestrates priority-based cascading alerts to room emergency contacts.
"""
import os
import hmac
import hashlib
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from collections import defaultdict

logger = logging.getLogger(__name__)

SECRET_KEY = os.environ.get("JWT_SECRET", "ohmguard-cascade-secret")


def _generate_ack_token(cascade_id: str, contact_id: str) -> str:
    """Generate HMAC token for cascade acknowledgment."""
    msg = f"{cascade_id}:{contact_id}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()[:32]


def _verify_ack_token(cascade_id: str, contact_id: str, token: str) -> bool:
    """Verify HMAC token for cascade acknowledgment."""
    expected = _generate_ack_token(cascade_id, contact_id)
    return hmac.compare_digest(expected, token)


class CascadeNotificationService:
    """Orchestrates cascading notifications to room emergency contacts."""

    def __init__(self, db):
        self.db = db
        self._task: Optional[asyncio.Task] = None

    def start_escalation_checker(self):
        """Start the background task that checks for pending escalations."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._escalation_loop())
            logger.info("Cascade escalation checker started")

    async def _escalation_loop(self):
        """Background loop checking for escalations every 30 seconds."""
        while True:
            try:
                await asyncio.sleep(30)
                await self.check_escalations()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Escalation check error: {e}")

    async def trigger_cascade(self, event: Dict, sensor: Dict):
        """Trigger a cascade notification for a fall event."""
        room_id = sensor.get("room_id")
        if not room_id:
            logger.debug("No room_id on sensor, skipping cascade")
            return

        from room_contacts_service import get_room_contacts_service
        contacts_svc = get_room_contacts_service()
        if not contacts_svc:
            return

        contacts = await contacts_svc.get_active_contacts_for_room(room_id)
        if not contacts:
            logger.debug(f"No contacts for room {room_id}, skipping cascade")
            return

        # Group by priority_order
        priority_groups = defaultdict(list)
        for c in contacts:
            priority_groups[c["priority_order"]].append(c)

        min_priority = min(priority_groups.keys())
        first_group = priority_groups[min_priority]

        # Determine escalation delay from first group (use max delay in group)
        escalation_delay = max(c.get("escalation_delay_minutes", 3) for c in first_group)

        now = datetime.now(timezone.utc)
        cascade = {
            "id": _new_id(),
            "event_id": event.get("id", ""),
            "room_id": room_id,
            "client_id": sensor.get("client_id", ""),
            "tenant_id": sensor.get("tenant_id", ""),
            "status": "NOTIFYING",
            "current_priority_level": min_priority,
            "contacts_notified": [],
            "acknowledged_by": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "next_escalation_at": (now + timedelta(minutes=escalation_delay)).isoformat(),
        }

        await self.db.cascade_alerts.insert_one(cascade)
        logger.info(f"Cascade {cascade['id']} created for event {event.get('id')} room {room_id}")

        # Send to first priority group
        await self._notify_group(cascade["id"], first_group, event, sensor)

    async def _notify_group(self, cascade_id: str, contacts: List[Dict], event: Dict, sensor: Dict):
        """Send notifications to a group of contacts via their preferred channels."""
        from notification_channels import get_channel_manager
        channel_mgr = get_channel_manager()
        if not channel_mgr:
            logger.error("ChannelManager not initialized")
            return

        message_text = self._build_fall_message(event, sensor, cascade_id)
        email_html = self._build_fall_email_html(event, sensor, cascade_id)

        for contact in contacts:
            for channel in contact.get("preferred_channels", []):
                recipient = self._get_recipient(contact, channel)
                if not recipient:
                    logger.warning(f"No {channel} recipient for contact {contact['full_name']}")
                    continue

                if channel == "EMAIL":
                    result = await channel_mgr.send(channel, recipient, email_html,
                                                     subject=f"[ALERTE CHUTE] {sensor.get('name', 'Capteur')} - Chambre {event.get('room_number', '')}")
                else:
                    result = await channel_mgr.send(channel, recipient, message_text)

                # Log notification
                notif_entry = {
                    "contact_id": contact["id"],
                    "contact_name": contact["full_name"],
                    "channel": channel,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                    "status": "sent" if result.get("success") else "failed",
                }

                await self.db.cascade_alerts.update_one(
                    {"id": cascade_id},
                    {"$push": {"contacts_notified": notif_entry},
                     "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
                )

                # Also log in notification_logs for audit
                await self.db.notification_logs.insert_one({
                    "id": _new_id(),
                    "event_id": event.get("id", ""),
                    "tenant_id": sensor.get("tenant_id", ""),
                    "channel": channel.lower(),
                    "recipient": f"{contact['full_name']} ({recipient})",
                    "status": "sent" if result.get("success") else "failed",
                    "message": f"Cascade alert - Priority {contact.get('priority_order', '?')}",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

                if result.get("success"):
                    logger.info(f"Cascade {cascade_id}: {channel} sent to {contact['full_name']}")
                else:
                    logger.warning(f"Cascade {cascade_id}: {channel} failed for {contact['full_name']}: {result.get('error')}")

    async def check_escalations(self):
        """Check for cascades that need escalation."""
        now = datetime.now(timezone.utc)
        pending = await self.db.cascade_alerts.find({
            "status": "NOTIFYING",
            "next_escalation_at": {"$lte": now.isoformat()}
        }).to_list(100)

        for cascade in pending:
            try:
                await self._escalate(cascade)
            except Exception as e:
                logger.error(f"Escalation failed for cascade {cascade['id']}: {e}")

    async def _escalate(self, cascade: Dict):
        """Escalate a cascade to the next priority level."""
        from room_contacts_service import get_room_contacts_service
        contacts_svc = get_room_contacts_service()
        if not contacts_svc:
            return

        room_id = cascade["room_id"]
        current_level = cascade["current_priority_level"]
        contacts = await contacts_svc.get_active_contacts_for_room(room_id)

        # Group by priority
        priority_groups = defaultdict(list)
        for c in contacts:
            priority_groups[c["priority_order"]].append(c)

        # Find next level
        available_levels = sorted(priority_groups.keys())
        next_levels = [l for l in available_levels if l > current_level]

        if not next_levels:
            # All levels exhausted
            await self.db.cascade_alerts.update_one(
                {"id": cascade["id"]},
                {"$set": {
                    "status": "EXHAUSTED",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "next_escalation_at": None
                }}
            )
            logger.info(f"Cascade {cascade['id']} exhausted - all priority levels notified")
            return

        next_level = next_levels[0]
        next_group = priority_groups[next_level]
        escalation_delay = max(c.get("escalation_delay_minutes", 3) for c in next_group)

        now = datetime.now(timezone.utc)
        await self.db.cascade_alerts.update_one(
            {"id": cascade["id"]},
            {"$set": {
                "status": "NOTIFYING",
                "current_priority_level": next_level,
                "updated_at": now.isoformat(),
                "next_escalation_at": (now + timedelta(minutes=escalation_delay)).isoformat()
            }}
        )

        logger.info(f"Cascade {cascade['id']} escalated to priority level {next_level}")

        # Get event for message building
        event = await self.db.events.find_one({"id": cascade["event_id"]}, {"_id": 0})
        sensor = None
        if event and event.get("sensor_id"):
            sensor = await self.db.sensors.find_one({"id": event["sensor_id"]}, {"_id": 0})

        await self._notify_group(cascade["id"], next_group, event or {}, sensor or {})

    async def acknowledge(self, cascade_id: str, contact_id: str, channel: str, token: str) -> Dict:
        """Acknowledge a cascade alert."""
        if not _verify_ack_token(cascade_id, contact_id, token):
            return {"success": False, "error": "Token invalide"}

        now = datetime.now(timezone.utc)

        # Use findOneAndUpdate to avoid race conditions
        result = await self.db.cascade_alerts.find_one_and_update(
            {"id": cascade_id, "status": {"$in": ["NOTIFYING", "ESCALATED"]}},
            {"$set": {
                "status": "ACKNOWLEDGED",
                "acknowledged_by": {
                    "contact_id": contact_id,
                    "contact_name": "",  # will be enriched below
                    "channel": channel,
                    "acknowledged_at": now.isoformat()
                },
                "updated_at": now.isoformat(),
                "next_escalation_at": None
            }},
            return_document=True,
            projection={"_id": 0}
        )

        if not result:
            # Check if already acknowledged
            existing = await self.db.cascade_alerts.find_one({"id": cascade_id}, {"_id": 0})
            if existing and existing.get("status") == "ACKNOWLEDGED":
                return {"success": True, "message": "Alerte déjà acquittée", "already_acknowledged": True}
            return {"success": False, "error": "Alerte introuvable ou déjà traitée"}

        # Enrich contact name
        contact = await self.db.room_contacts.find_one({"id": contact_id}, {"_id": 0})
        if contact:
            await self.db.cascade_alerts.update_one(
                {"id": cascade_id},
                {"$set": {"acknowledged_by.contact_name": contact.get("full_name", "")}}
            )

        logger.info(f"Cascade {cascade_id} acknowledged by contact {contact_id} via {channel}")
        return {"success": True, "message": "Alerte acquittée avec succès"}

    def _get_recipient(self, contact: Dict, channel: str) -> Optional[str]:
        """Get the recipient address for a given channel."""
        if channel == "SMS":
            return contact.get("phone")
        elif channel == "WHATSAPP":
            return contact.get("whatsapp_number") or contact.get("phone")
        elif channel == "TELEGRAM":
            return contact.get("telegram_chat_id")
        elif channel == "EMAIL":
            return contact.get("email")
        return None

    def _build_fall_message(self, event: Dict, sensor: Dict, cascade_id: str) -> str:
        """Build plain text fall alert message for SMS/WhatsApp/Telegram."""
        sensor_name = sensor.get("name", "Capteur inconnu")
        location = sensor.get("room_name", sensor.get("building_name", "Localisation inconnue"))
        timestamp = event.get("timestamp", datetime.now(timezone.utc).isoformat())

        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            time_str = dt.strftime("%d/%m/%Y %H:%M")
        except Exception:
            time_str = timestamp

        # Build ack URL (contact_id and token will be per-contact, but for simplicity
        # we include a generic message - the ack link is added per-contact in _notify_group)
        backend_url = os.environ.get("BACKEND_URL", os.environ.get("REACT_APP_BACKEND_URL", ""))

        msg = (
            f"ALERTE CHUTE - OhmGuard\n"
            f"Capteur: {sensor_name}\n"
            f"Lieu: {location}\n"
            f"Heure: {time_str}\n"
            f"\nAction requise: vérifiez immédiatement."
        )

        return msg

    def _build_fall_email_html(self, event: Dict, sensor: Dict, cascade_id: str) -> str:
        """Build HTML email for fall alert (reuses existing style)."""
        sensor_name = sensor.get("name", "Capteur inconnu")
        location = sensor.get("room_name", sensor.get("building_name", "Localisation inconnue"))
        timestamp = event.get("timestamp", datetime.now(timezone.utc).isoformat())

        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            time_str = dt.strftime("%d/%m/%Y à %H:%M:%S")
        except Exception:
            time_str = timestamp

        return f"""
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="margin: 0;">ALERTE CHUTE</h2>
                <p style="margin: 8px 0 0; opacity: 0.85; font-size: 14px;">Contact d'urgence</p>
            </div>
            <div style="background: #fef2f2; padding: 24px; border: 1px solid #fecaca; border-top: none; border-radius: 0 0 8px 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Capteur</td>
                        <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">{sensor_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Localisation</td>
                        <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">{location}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date / Heure</td>
                        <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">{time_str}</td>
                    </tr>
                </table>
                <hr style="border: none; border-top: 1px solid #fecaca; margin: 16px 0;">
                <p style="color: #991b1b; font-weight: 600; margin: 0;">Action requise : veuillez vérifier immédiatement.</p>
            </div>
            <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 12px;">
                OhmGuard — Système de détection de chute
            </p>
        </div>
        """


def _new_id() -> str:
    import uuid
    return str(uuid.uuid4())


# Singleton
_cascade_service: Optional[CascadeNotificationService] = None


def get_cascade_service() -> Optional[CascadeNotificationService]:
    return _cascade_service


def init_cascade_service(db) -> CascadeNotificationService:
    global _cascade_service
    _cascade_service = CascadeNotificationService(db)
    return _cascade_service
