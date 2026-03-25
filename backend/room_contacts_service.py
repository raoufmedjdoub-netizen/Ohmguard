"""
Room Contacts Service for OhmGuard
CRUD operations for room-level emergency contacts.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict
from room_contacts_models import RoomContact, RoomContactCreate, RoomContactUpdate

logger = logging.getLogger(__name__)


class RoomContactsService:
    """Manages emergency contacts for rooms."""

    def __init__(self, db):
        self.db = db

    async def list_contacts(self, room_id: str) -> List[Dict]:
        """List all contacts for a room, sorted by priority_order."""
        cursor = self.db.room_contacts.find(
            {"room_id": room_id},
            {"_id": 0}
        ).sort("priority_order", 1)
        return await cursor.to_list(length=100)

    async def get_contact(self, contact_id: str) -> Optional[Dict]:
        """Get a single contact by ID."""
        return await self.db.room_contacts.find_one(
            {"id": contact_id}, {"_id": 0}
        )

    async def create_contact(self, room_id: str, data: RoomContactCreate) -> Dict:
        """Create a new contact for a room."""
        room = await self.db.rooms.find_one({"id": room_id}, {"_id": 0})
        if not room:
            raise ValueError(f"Chambre {room_id} introuvable")

        # Auto-assign next priority if not specified or conflicts
        existing = await self.db.room_contacts.count_documents({"room_id": room_id})
        priority = data.priority_order if data.priority_order else existing + 1

        contact = RoomContact(
            room_id=room_id,
            building_id=room.get("building_id", ""),
            floor_id=room.get("floor_id", ""),
            client_id=room.get("client_id", ""),
            full_name=data.full_name,
            relationship=data.relationship,
            phone=data.phone,
            email=data.email,
            whatsapp_number=data.whatsapp_number,
            telegram_chat_id=data.telegram_chat_id,
            preferred_channels=data.preferred_channels,
            priority_order=priority,
            escalation_delay_minutes=data.escalation_delay_minutes,
            notes=data.notes,
        )

        doc = contact.model_dump()
        await self.db.room_contacts.insert_one(doc)
        doc.pop("_id", None)

        logger.info(f"Contact created: {contact.full_name} for room {room_id} (priority {priority})")
        return doc

    async def update_contact(self, contact_id: str, data: RoomContactUpdate) -> Optional[Dict]:
        """Update a contact."""
        update_data = data.model_dump(exclude_none=True)
        if not update_data:
            return await self.get_contact(contact_id)

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        result = await self.db.room_contacts.find_one_and_update(
            {"id": contact_id},
            {"$set": update_data},
            return_document=True,
            projection={"_id": 0}
        )
        if result:
            logger.info(f"Contact updated: {contact_id}")
        return result

    async def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact and reorder remaining priorities."""
        contact = await self.get_contact(contact_id)
        if not contact:
            return False

        await self.db.room_contacts.delete_one({"id": contact_id})

        # Reorder remaining contacts
        remaining = await self.db.room_contacts.find(
            {"room_id": contact["room_id"]},
            {"_id": 0}
        ).sort("priority_order", 1).to_list(100)

        for i, c in enumerate(remaining):
            await self.db.room_contacts.update_one(
                {"id": c["id"]},
                {"$set": {"priority_order": i + 1}}
            )

        logger.info(f"Contact deleted: {contact_id}")
        return True

    async def reorder_contacts(self, room_id: str, contact_ids: List[str]) -> bool:
        """Reorder contacts by updating priority_order based on position in list."""
        for i, cid in enumerate(contact_ids):
            await self.db.room_contacts.update_one(
                {"id": cid, "room_id": room_id},
                {"$set": {
                    "priority_order": i + 1,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        logger.info(f"Contacts reordered for room {room_id}: {contact_ids}")
        return True

    async def get_active_contacts_for_room(self, room_id: str) -> List[Dict]:
        """Get active contacts sorted by priority (used by cascade service)."""
        cursor = self.db.room_contacts.find(
            {"room_id": room_id, "is_active": True},
            {"_id": 0}
        ).sort("priority_order", 1)
        return await cursor.to_list(length=100)


# Singleton
_room_contacts_service: Optional[RoomContactsService] = None


def get_room_contacts_service() -> Optional[RoomContactsService]:
    return _room_contacts_service


def init_room_contacts_service(db) -> RoomContactsService:
    global _room_contacts_service
    _room_contacts_service = RoomContactsService(db)
    return _room_contacts_service
