"""
Clients & Buildings Service
Business logic for multi-tenant hierarchical structure management
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

from clients_buildings_models import (
    Client, ClientCreate, ClientUpdate,
    Building, BuildingCreate, BuildingUpdate,
    Floor, FloorCreate, FloorUpdate,
    Room, RoomCreate, RoomUpdate,
    RoomSpace, RoomSpaceCreate, RoomSpaceUpdate,
    ZoneNew, ZoneCreateNew, ZoneUpdateNew,
    RadarLocation, RadarAssignRequest, RadarAssignmentHistory,
    ClientUser, ClientUserCreate, ClientUserUpdate,
    LocationPath, TreeNode
)


class ClientsBuildingsService:
    """Service for managing clients and buildings hierarchy"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # ==================== CLIENTS ====================
    
    async def list_clients(self, include_stats: bool = True) -> List[dict]:
        """List all clients with optional stats"""
        clients = await self.db.clients.find({"status": {"$ne": "INACTIVE"}}, {"_id": 0}).to_list(1000)
        
        if include_stats:
            for client in clients:
                client["buildings_count"] = await self.db.buildings.count_documents({"client_id": client["id"]})
                client["radars_count"] = await self.db.sensors.count_documents({"client_id": client["id"]})
                client["active_radars_count"] = await self.db.sensors.count_documents({
                    "client_id": client["id"],
                    "status": "ONLINE"
                })
        
        return clients
    
    async def get_client(self, client_id: str, include_stats: bool = True) -> Optional[dict]:
        """Get a single client by ID"""
        client = await self.db.clients.find_one({"id": client_id}, {"_id": 0})
        
        if client and include_stats:
            client["buildings_count"] = await self.db.buildings.count_documents({"client_id": client_id})
            client["radars_count"] = await self.db.sensors.count_documents({"client_id": client_id})
            client["active_radars_count"] = await self.db.sensors.count_documents({
                "client_id": client_id,
                "status": "ONLINE"
            })
        
        return client
    
    async def create_client(self, data: ClientCreate) -> dict:
        """Create a new client"""
        client = Client(**data.model_dump())
        doc = client.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.clients.insert_one(doc)
        return await self.get_client(client.id)
    
    async def update_client(self, client_id: str, data: ClientUpdate) -> Optional[dict]:
        """Update a client"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.get_client(client_id)

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        await self.db.clients.update_one(
            {"id": client_id},
            {"$set": update_data}
        )
        return await self.get_client(client_id)

    async def delete_client(self, client_id: str) -> dict:
        """
        Delete a client and cascade delete all related data.
        Returns a summary of deleted records.
        """
        summary = {
            "client_id": client_id,
            "deleted": {}
        }

        # Delete room spaces
        result = await self.db.room_spaces.delete_many({"client_id": client_id})
        summary["deleted"]["room_spaces"] = result.deleted_count

        # Delete rooms
        result = await self.db.rooms.delete_many({"client_id": client_id})
        summary["deleted"]["rooms"] = result.deleted_count

        # Delete zones
        result = await self.db.zones_new.delete_many({"client_id": client_id})
        summary["deleted"]["zones"] = result.deleted_count

        # Delete floors
        result = await self.db.floors.delete_many({"client_id": client_id})
        summary["deleted"]["floors"] = result.deleted_count

        # Delete buildings
        result = await self.db.buildings.delete_many({"client_id": client_id})
        summary["deleted"]["buildings"] = result.deleted_count

        # Unassign sensors (don't delete, just remove client association)
        result = await self.db.sensors.update_many(
            {"client_id": client_id},
            {"$set": {
                "client_id": None,
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        summary["deleted"]["sensors_unassigned"] = result.modified_count

        # Delete RBAC data: location_scopes
        result = await self.db.location_scopes.delete_many({"client_id": client_id})
        summary["deleted"]["location_scopes"] = result.deleted_count

        # Delete RBAC data: permission_overrides for client_users of this client
        client_user_ids = [cu["id"] for cu in await self.db.client_users.find(
            {"client_id": client_id}, {"id": 1}
        ).to_list(10000)]

        if client_user_ids:
            result = await self.db.permission_overrides.delete_many(
                {"client_user_id": {"$in": client_user_ids}}
            )
            summary["deleted"]["permission_overrides"] = result.deleted_count
        else:
            summary["deleted"]["permission_overrides"] = 0

        # Delete client_users
        result = await self.db.client_users.delete_many({"client_id": client_id})
        summary["deleted"]["client_users"] = result.deleted_count

        # Delete alert_rules for this client (using tenant_id = client_id)
        result = await self.db.alert_rules.delete_many({"tenant_id": client_id})
        summary["deleted"]["alert_rules"] = result.deleted_count

        # Delete audit logs for this client
        result = await self.db.audit_logs.delete_many({"tenant_id": client_id})
        summary["deleted"]["audit_logs"] = result.deleted_count

        # Delete RBAC audit logs for this client
        result = await self.db.rbac_audit_logs.delete_many({"client_id": client_id})
        summary["deleted"]["rbac_audit_logs"] = result.deleted_count

        # Finally, delete the client itself
        result = await self.db.clients.delete_one({"id": client_id})
        summary["deleted"]["client"] = result.deleted_count

        return summary

    # ==================== BUILDINGS ====================
    
    async def list_buildings(self, client_id: str, include_stats: bool = True) -> List[dict]:
        """List buildings for a client"""
        buildings = await self.db.buildings.find(
            {"client_id": client_id}, {"_id": 0}
        ).to_list(1000)
        
        if include_stats:
            for building in buildings:
                building["floors_count"] = await self.db.floors.count_documents({"building_id": building["id"]})
                building["rooms_count"] = await self.db.rooms.count_documents({"building_id": building["id"]})
                building["radars_count"] = await self.db.sensors.count_documents({"building_id": building["id"]})
        
        return buildings
    
    async def get_building(self, building_id: str, include_stats: bool = True) -> Optional[dict]:
        """Get a building by ID"""
        building = await self.db.buildings.find_one({"id": building_id}, {"_id": 0})
        
        if building and include_stats:
            building["floors_count"] = await self.db.floors.count_documents({"building_id": building_id})
            building["rooms_count"] = await self.db.rooms.count_documents({"building_id": building_id})
            building["radars_count"] = await self.db.sensors.count_documents({"building_id": building_id})
            
            # Add client name for breadcrumb
            client = await self.db.clients.find_one({"id": building.get("client_id")}, {"_id": 0, "name": 1})
            if client:
                building["client_name"] = client.get("name")
        
        return building
    
    async def create_building(self, client_id: str, data: BuildingCreate) -> dict:
        """Create a new building"""
        building_data = data.model_dump()
        building_data["client_id"] = client_id
        building = Building(**building_data)
        
        doc = building.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.buildings.insert_one(doc)
        return await self.get_building(building.id)
    
    async def update_building(self, building_id: str, data: BuildingUpdate) -> Optional[dict]:
        """Update a building"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.get_building(building_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.buildings.update_one(
            {"id": building_id},
            {"$set": update_data}
        )
        return await self.get_building(building_id)
    
    async def delete_building(self, building_id: str) -> bool:
        """Delete a building and all its children"""
        # Get all floors
        floor_ids = [f["id"] for f in await self.db.floors.find({"building_id": building_id}, {"id": 1}).to_list(1000)]
        
        # Delete room spaces
        await self.db.room_spaces.delete_many({"building_id": building_id})
        
        # Delete rooms
        await self.db.rooms.delete_many({"building_id": building_id})
        
        # Delete zones
        await self.db.zones_new.delete_many({"building_id": building_id})
        
        # Delete floors
        await self.db.floors.delete_many({"building_id": building_id})
        
        # Unassign radars
        await self.db.sensors.update_many(
            {"building_id": building_id},
            {"$set": {
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        # Delete building
        result = await self.db.buildings.delete_one({"id": building_id})
        return result.deleted_count > 0
    
    # ==================== FLOORS ====================
    
    async def list_floors(self, building_id: str, include_stats: bool = True) -> List[dict]:
        """List floors for a building"""
        floors = await self.db.floors.find(
            {"building_id": building_id}, {"_id": 0}
        ).sort("index", 1).to_list(100)
        
        if include_stats:
            for floor in floors:
                floor["rooms_count"] = await self.db.rooms.count_documents({"floor_id": floor["id"]})
                floor["zones_count"] = await self.db.zones_new.count_documents({"floor_id": floor["id"]})
                floor["radars_count"] = await self.db.sensors.count_documents({"floor_id": floor["id"]})
        
        return floors
    
    async def get_floor(self, floor_id: str, include_stats: bool = True) -> Optional[dict]:
        """Get a floor by ID"""
        floor = await self.db.floors.find_one({"id": floor_id}, {"_id": 0})
        
        if floor and include_stats:
            floor["rooms_count"] = await self.db.rooms.count_documents({"floor_id": floor_id})
            floor["zones_count"] = await self.db.zones_new.count_documents({"floor_id": floor_id})
            floor["radars_count"] = await self.db.sensors.count_documents({"floor_id": floor_id})
            
            # Add parent names for breadcrumb
            building = await self.db.buildings.find_one({"id": floor.get("building_id")}, {"_id": 0, "name": 1})
            if building:
                floor["building_name"] = building.get("name")
            client = await self.db.clients.find_one({"id": floor.get("client_id")}, {"_id": 0, "name": 1})
            if client:
                floor["client_name"] = client.get("name")
        
        return floor
    
    async def create_floor(self, building_id: str, data: FloorCreate) -> dict:
        """Create a new floor"""
        building = await self.get_building(building_id, include_stats=False)
        if not building:
            raise ValueError("Building not found")
        
        floor = Floor(
            **data.model_dump(),
            building_id=building_id,
            client_id=building["client_id"]
        )
        
        doc = floor.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.floors.insert_one(doc)
        return await self.get_floor(floor.id)
    
    async def update_floor(self, floor_id: str, data: FloorUpdate) -> Optional[dict]:
        """Update a floor"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.get_floor(floor_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.floors.update_one(
            {"id": floor_id},
            {"$set": update_data}
        )
        return await self.get_floor(floor_id)
    
    async def delete_floor(self, floor_id: str) -> bool:
        """Delete a floor and all its children"""
        # Delete room spaces
        await self.db.room_spaces.delete_many({"floor_id": floor_id})
        
        # Delete rooms
        await self.db.rooms.delete_many({"floor_id": floor_id})
        
        # Delete zones
        await self.db.zones_new.delete_many({"floor_id": floor_id})
        
        # Unassign radars
        await self.db.sensors.update_many(
            {"floor_id": floor_id},
            {"$set": {
                "client_id": None,
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        # Delete floor
        result = await self.db.floors.delete_one({"id": floor_id})
        return result.deleted_count > 0
    
    # ==================== ROOMS ====================
    
    async def list_rooms(self, floor_id: str, include_stats: bool = True) -> List[dict]:
        """List rooms for a floor"""
        rooms = await self.db.rooms.find(
            {"floor_id": floor_id}, {"_id": 0}
        ).sort("room_number", 1).to_list(1000)
        
        if include_stats:
            for room in rooms:
                room["spaces_count"] = await self.db.room_spaces.count_documents({"room_id": room["id"]})
                room["radars_count"] = await self.db.sensors.count_documents({"room_id": room["id"]})
        
        return rooms
    
    async def get_room(self, room_id: str, include_spaces: bool = True) -> Optional[dict]:
        """Get a room by ID"""
        room = await self.db.rooms.find_one({"id": room_id}, {"_id": 0})
        
        if room:
            # Les espaces sont stockés dans le tableau "spaces" du document room
            embedded_spaces = room.get("spaces", [])
            room["spaces_count"] = len(embedded_spaces)
            room["radars_count"] = await self.db.sensors.count_documents({"room_id": room_id})
            
            # Add parent names for breadcrumb
            floor = await self.db.floors.find_one({"id": room.get("floor_id")}, {"_id": 0, "name": 1, "building_id": 1})
            if floor:
                room["floor_name"] = floor.get("name")
                building = await self.db.buildings.find_one({"id": room.get("building_id")}, {"_id": 0, "name": 1, "client_id": 1})
                if building:
                    room["building_name"] = building.get("name")
                    client = await self.db.clients.find_one({"id": room.get("client_id")}, {"_id": 0, "name": 1})
                    if client:
                        room["client_name"] = client.get("name")
            
            if include_spaces:
                # Enrichir chaque espace avec les infos du radar
                for space in embedded_spaces:
                    radar = await self.db.sensors.find_one(
                        {"room_space_id": space["id"]}, {"_id": 0, "id": 1, "name": 1, "device_id": 1, "status": 1}
                    )
                    space["has_radar"] = radar is not None
                    space["radar"] = radar
                
                room["spaces"] = embedded_spaces
        
        return room
    
    async def create_room(self, floor_id: str, data: RoomCreate) -> dict:
        """Create a new room with optional auto-created spaces"""
        floor = await self.get_floor(floor_id, include_stats=False)
        if not floor:
            raise ValueError("Floor not found")
        
        # Check for duplicate room number
        existing = await self.db.rooms.find_one({
            "building_id": floor["building_id"],
            "room_number": data.room_number
        })
        if existing:
            raise ValueError(f"Room number {data.room_number} already exists in this building")
        
        room = Room(
            room_number=data.room_number,
            name=data.name,
            room_type=data.room_type,
            capacity=data.capacity,
            occupant_name=data.occupant_name,
            occupant_info=data.occupant_info,
            notes=data.notes,
            building_id=floor["building_id"],
            floor_id=floor_id,
            client_id=floor["client_id"]
        )
        
        doc = room.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.rooms.insert_one(doc)
        
        # Auto-create bedroom space
        await self._create_room_space(room.id, floor["building_id"], floor_id, floor["client_id"], "BEDROOM", "Chambre à coucher")
        
        # Optionally create bathroom
        if data.create_bathroom:
            await self._create_room_space(room.id, floor["building_id"], floor_id, floor["client_id"], "BATHROOM", "Salle de bain")
        
        # Optionally create kitchenette
        if data.create_kitchenette:
            await self._create_room_space(room.id, floor["building_id"], floor_id, floor["client_id"], "KITCHENETTE", "Kitchenette")
        
        return await self.get_room(room.id)
    
    async def _create_room_space(self, room_id: str, building_id: str, floor_id: str, client_id: str, space_type: str, name: str) -> dict:
        """Internal method to create a room space"""
        space = RoomSpace(
            name=name,
            space_type=space_type,
            room_id=room_id,
            building_id=building_id,
            floor_id=floor_id,
            client_id=client_id
        )
        
        doc = space.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.room_spaces.insert_one(doc)
        return doc
    
    async def update_room(self, room_id: str, data: RoomUpdate) -> Optional[dict]:
        """Update a room"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.get_room(room_id)
        
        # Check for duplicate room number if updating
        if "room_number" in update_data:
            room = await self.db.rooms.find_one({"id": room_id}, {"building_id": 1})
            existing = await self.db.rooms.find_one({
                "building_id": room["building_id"],
                "room_number": update_data["room_number"],
                "id": {"$ne": room_id}
            })
            if existing:
                raise ValueError(f"Room number {update_data['room_number']} already exists")
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.rooms.update_one(
            {"id": room_id},
            {"$set": update_data}
        )
        return await self.get_room(room_id)
    
    async def delete_room(self, room_id: str) -> bool:
        """Delete a room and its spaces"""
        # Delete room spaces
        await self.db.room_spaces.delete_many({"room_id": room_id})
        
        # Unassign radars
        await self.db.sensors.update_many(
            {"room_id": room_id},
            {"$set": {
                "client_id": None,
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        # Delete room
        result = await self.db.rooms.delete_one({"id": room_id})
        return result.deleted_count > 0
    
    # ==================== ROOM SPACES ====================
    
    async def add_room_space(self, room_id: str, data: RoomSpaceCreate) -> dict:
        """Add a space to a room"""
        room = await self.db.rooms.find_one({"id": room_id}, {"_id": 0})
        if not room:
            raise ValueError("Room not found")
        
        # Check for duplicate standard space types
        if data.space_type != "OTHER":
            existing = await self.db.room_spaces.find_one({
                "room_id": room_id,
                "space_type": data.space_type
            })
            if existing:
                raise ValueError(f"Space type {data.space_type} already exists in this room")
        
        space = RoomSpace(
            name=data.name,
            space_type=data.space_type,
            notes=data.notes,
            room_id=room_id,
            building_id=room["building_id"],
            floor_id=room["floor_id"],
            client_id=room["client_id"]
        )
        
        doc = space.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.room_spaces.insert_one(doc)
        return doc
    
    async def update_room_space(self, space_id: str, data: RoomSpaceUpdate) -> Optional[dict]:
        """Update a room space"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.db.room_spaces.find_one({"id": space_id}, {"_id": 0})
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.room_spaces.update_one(
            {"id": space_id},
            {"$set": update_data}
        )
        return await self.db.room_spaces.find_one({"id": space_id}, {"_id": 0})
    
    async def delete_room_space(self, space_id: str) -> bool:
        """Delete a room space"""
        # Unassign radars
        await self.db.sensors.update_many(
            {"room_space_id": space_id},
            {"$set": {
                "client_id": None,
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        result = await self.db.room_spaces.delete_one({"id": space_id})
        return result.deleted_count > 0
    
    # ==================== ZONES ====================
    
    async def list_zones(self, building_id: str, floor_id: Optional[str] = None) -> List[dict]:
        """List zones for a building or floor"""
        query = {"building_id": building_id}
        if floor_id:
            query["floor_id"] = floor_id
        
        zones = await self.db.zones_new.find(query, {"_id": 0}).to_list(100)
        
        for zone in zones:
            zone["radars_count"] = await self.db.sensors.count_documents({"zone_id": zone["id"]})
        
        return zones
    
    async def get_zone(self, zone_id: str) -> Optional[dict]:
        """Get a zone by ID"""
        zone = await self.db.zones_new.find_one({"id": zone_id}, {"_id": 0})
        if zone:
            zone["radars_count"] = await self.db.sensors.count_documents({"zone_id": zone_id})
        return zone
    
    async def create_zone(self, building_id: str, data: ZoneCreateNew) -> dict:
        """Create a new zone"""
        building = await self.get_building(building_id, include_stats=False)
        if not building:
            raise ValueError("Building not found")
        
        zone = ZoneNew(
            name=data.name,
            zone_type=data.zone_type,
            floor_id=data.floor_id,
            notes=data.notes,
            building_id=building_id,
            client_id=building["client_id"]
        )
        
        doc = zone.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        await self.db.zones_new.insert_one(doc)
        return await self.get_zone(zone.id)
    
    async def update_zone(self, zone_id: str, data: ZoneUpdateNew) -> Optional[dict]:
        """Update a zone"""
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            return await self.get_zone(zone_id)
        
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self.db.zones_new.update_one(
            {"id": zone_id},
            {"$set": update_data}
        )
        return await self.get_zone(zone_id)
    
    async def delete_zone(self, zone_id: str) -> bool:
        """Delete a zone"""
        # Unassign radars
        await self.db.sensors.update_many(
            {"zone_id": zone_id},
            {"$set": {
                "client_id": None,
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        result = await self.db.zones_new.delete_one({"id": zone_id})
        return result.deleted_count > 0
    
    # ==================== RADAR ASSIGNMENT ====================
    
    async def get_radar_location(self, radar_id: str) -> RadarLocation:
        """Get full location info for a radar"""
        radar = await self.db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            return RadarLocation()
        
        location = RadarLocation(client_id=radar.get("client_id"))
        
        if radar.get("client_id"):
            client = await self.db.clients.find_one({"id": radar["client_id"]}, {"name": 1})
            if client:
                location.client_name = client.get("name")
        
        if radar.get("building_id"):
            building = await self.db.buildings.find_one({"id": radar["building_id"]}, {"name": 1})
            if building:
                location.building_id = radar["building_id"]
                location.building_name = building.get("name")
        
        if radar.get("floor_id"):
            floor = await self.db.floors.find_one({"id": radar["floor_id"]}, {"name": 1})
            if floor:
                location.floor_id = radar["floor_id"]
                location.floor_name = floor.get("name")
        
        if radar.get("zone_id"):
            zone = await self.db.zones_new.find_one({"id": radar["zone_id"]}, {"name": 1})
            if zone:
                location.zone_id = radar["zone_id"]
                location.zone_name = zone.get("name")
        
        if radar.get("room_id"):
            room = await self.db.rooms.find_one({"id": radar["room_id"]}, {"room_number": 1})
            if room:
                location.room_id = radar["room_id"]
                location.room_number = room.get("room_number")
        
        if radar.get("room_space_id"):
            space = await self.db.room_spaces.find_one({"id": radar["room_space_id"]}, {"space_type": 1, "name": 1})
            if space:
                location.room_space_id = radar["room_space_id"]
                location.space_type = space.get("space_type")
                location.space_name = space.get("name")
        
        return location
    
    async def assign_radar(self, radar_id: str, data: RadarAssignRequest, user_id: str) -> dict:
        """Assign a radar to a location"""
        radar = await self.db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise ValueError("Radar not found")
        
        # Get current location for history
        from_location = await self.get_radar_location(radar_id)
        
        # Determine target and validate
        update_data = {
            "room_space_id": None,
            "room_id": None,
            "zone_id": None
        }
        to_location = RadarLocation(client_id=radar.get("client_id"))
        
        if data.room_space_id:
            space = await self.db.room_spaces.find_one({"id": data.room_space_id}, {"_id": 0})
            if not space:
                raise ValueError("Room space not found")
            
            update_data["room_space_id"] = data.room_space_id
            update_data["room_id"] = space["room_id"]
            update_data["floor_id"] = space["floor_id"]
            update_data["building_id"] = space["building_id"]
            update_data["client_id"] = space["client_id"]
            
            # Get names for location
            to_location = await self._build_location_from_space(space)
            
        elif data.room_id:
            room = await self.db.rooms.find_one({"id": data.room_id}, {"_id": 0})
            if not room:
                raise ValueError("Room not found")
            
            update_data["room_id"] = data.room_id
            update_data["floor_id"] = room["floor_id"]
            update_data["building_id"] = room["building_id"]
            update_data["client_id"] = room["client_id"]
            
            to_location = await self._build_location_from_room(room)
            
        elif data.zone_id:
            zone = await self.db.zones_new.find_one({"id": data.zone_id}, {"_id": 0})
            if not zone:
                raise ValueError("Zone not found")
            
            update_data["zone_id"] = data.zone_id
            update_data["floor_id"] = zone.get("floor_id")
            update_data["building_id"] = zone["building_id"]
            update_data["client_id"] = zone["client_id"]
            
            to_location = await self._build_location_from_zone(zone)
        else:
            raise ValueError("Must specify room_space_id, room_id, or zone_id")
        
        # Update radar
        await self.db.sensors.update_one(
            {"id": radar_id},
            {"$set": update_data}
        )
        
        # Close previous assignment if exists
        await self.db.radar_assignments.update_many(
            {"radar_id": radar_id, "unassigned_at": None},
            {"$set": {"unassigned_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Create assignment history
        history = RadarAssignmentHistory(
            radar_id=radar_id,
            client_id=update_data["client_id"],
            assigned_by_user_id=user_id,
            from_location=from_location if from_location.client_id else None,
            to_location=to_location,
            reason=data.reason
        )
        
        history_doc = history.model_dump()
        history_doc["assigned_at"] = history_doc["assigned_at"].isoformat()
        if history_doc.get("from_location"):
            history_doc["from_location"] = from_location.model_dump()
        history_doc["to_location"] = to_location.model_dump()
        
        await self.db.radar_assignments.insert_one(history_doc)
        
        return await self.db.sensors.find_one({"id": radar_id}, {"_id": 0})
    
    async def _build_location_from_space(self, space: dict) -> RadarLocation:
        """Build RadarLocation from a room space"""
        location = RadarLocation(
            client_id=space["client_id"],
            building_id=space["building_id"],
            floor_id=space["floor_id"],
            room_space_id=space["id"],
            space_type=space["space_type"],
            space_name=space.get("name")
        )
        
        # Get names
        client = await self.db.clients.find_one({"id": space["client_id"]}, {"name": 1})
        building = await self.db.buildings.find_one({"id": space["building_id"]}, {"name": 1})
        floor = await self.db.floors.find_one({"id": space["floor_id"]}, {"name": 1})
        room = await self.db.rooms.find_one({"id": space["room_id"]}, {"room_number": 1})
        
        location.client_name = client.get("name") if client else None
        location.building_name = building.get("name") if building else None
        location.floor_name = floor.get("name") if floor else None
        location.room_id = space["room_id"]
        location.room_number = room.get("room_number") if room else None
        
        return location
    
    async def _build_location_from_room(self, room: dict) -> RadarLocation:
        """Build RadarLocation from a room"""
        location = RadarLocation(
            client_id=room["client_id"],
            building_id=room["building_id"],
            floor_id=room["floor_id"],
            room_id=room["id"],
            room_number=room["room_number"]
        )
        
        client = await self.db.clients.find_one({"id": room["client_id"]}, {"name": 1})
        building = await self.db.buildings.find_one({"id": room["building_id"]}, {"name": 1})
        floor = await self.db.floors.find_one({"id": room["floor_id"]}, {"name": 1})
        
        location.client_name = client.get("name") if client else None
        location.building_name = building.get("name") if building else None
        location.floor_name = floor.get("name") if floor else None
        
        return location
    
    async def _build_location_from_zone(self, zone: dict) -> RadarLocation:
        """Build RadarLocation from a zone"""
        location = RadarLocation(
            client_id=zone["client_id"],
            building_id=zone["building_id"],
            floor_id=zone.get("floor_id"),
            zone_id=zone["id"],
            zone_name=zone["name"]
        )
        
        client = await self.db.clients.find_one({"id": zone["client_id"]}, {"name": 1})
        building = await self.db.buildings.find_one({"id": zone["building_id"]}, {"name": 1})
        
        location.client_name = client.get("name") if client else None
        location.building_name = building.get("name") if building else None
        
        if zone.get("floor_id"):
            floor = await self.db.floors.find_one({"id": zone["floor_id"]}, {"name": 1})
            location.floor_name = floor.get("name") if floor else None
        
        return location
    
    async def unassign_radar(self, radar_id: str, user_id: str, reason: Optional[str] = None) -> dict:
        """Unassign a radar from its current location"""
        radar = await self.db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise ValueError("Radar not found")
        
        # Update radar
        await self.db.sensors.update_one(
            {"id": radar_id},
            {"$set": {
                "building_id": None,
                "floor_id": None,
                "room_id": None,
                "room_space_id": None,
                "zone_id": None
            }}
        )
        
        # Close assignment
        await self.db.radar_assignments.update_many(
            {"radar_id": radar_id, "unassigned_at": None},
            {"$set": {"unassigned_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return await self.db.sensors.find_one({"id": radar_id}, {"_id": 0})
    
    async def get_radar_assignment_history(self, radar_id: str) -> List[dict]:
        """Get assignment history for a radar"""
        history = await self.db.radar_assignments.find(
            {"radar_id": radar_id}, {"_id": 0}
        ).sort("assigned_at", -1).to_list(100)
        return history
    
    # ==================== TREE VIEW ====================
    
    async def get_client_tree(self, client_id: str) -> List[TreeNode]:
        """Get full hierarchical tree for a client"""
        client = await self.get_client(client_id)
        if not client:
            return []
        
        buildings = await self.list_buildings(client_id)
        building_nodes = []
        
        for building in buildings:
            floors = await self.list_floors(building["id"])
            floor_nodes = []
            
            for floor in floors:
                # Get rooms
                rooms = await self.list_rooms(floor["id"])
                room_nodes = []
                
                for room in rooms:
                    spaces = await self.db.room_spaces.find({"room_id": room["id"]}, {"_id": 0}).to_list(20)
                    space_nodes = []
                    for space in spaces:
                        has_radar = await self.db.sensors.find_one({"room_space_id": space["id"]})
                        space_nodes.append(TreeNode(
                            id=space["id"],
                            name=space.get("name") or space["space_type"],
                            type="space",
                            parent_id=room["id"],
                            metadata={"space_type": space["space_type"]},
                            radars_count=1 if has_radar else 0
                        ))
                    
                    room_name = room.get("name") or f"Ch. {room.get('room_number', 'N/A')}"
                    room_nodes.append(TreeNode(
                        id=room["id"],
                        name=room_name,
                        type="room",
                        parent_id=floor["id"],
                        children=space_nodes,
                        metadata={"room_type": room.get("room_type", "UNKNOWN")},
                        radars_count=room.get("radars_count", 0)
                    ))
                
                # Get zones
                zones = await self.list_zones(building["id"], floor["id"])
                zone_nodes = [
                    TreeNode(
                        id=zone["id"],
                        name=zone.get("name", "Zone"),
                        type="zone",
                        parent_id=floor["id"],
                        metadata={"zone_type": zone.get("zone_type", "UNKNOWN")},
                        radars_count=zone.get("radars_count", 0)
                    )
                    for zone in zones
                ]
                
                floor_nodes.append(TreeNode(
                    id=floor["id"],
                    name=floor.get("name", f"Étage {floor.get('index', '?')}"),
                    type="floor",
                    parent_id=building["id"],
                    children=room_nodes + zone_nodes,
                    metadata={"index": floor.get("index", 0)},
                    radars_count=floor.get("radars_count", 0)
                ))
            
            # Building-level zones (no floor)
            building_zones = await self.db.zones_new.find({
                "building_id": building["id"],
                "floor_id": None
            }, {"_id": 0}).to_list(50)
            
            building_zone_nodes = []
            for z in building_zones:
                zone_radar_count = await self.db.sensors.count_documents({"zone_id": z["id"]})
                building_zone_nodes.append(TreeNode(
                    id=z["id"],
                    name=z.get("name", "Zone"),
                    type="zone",
                    parent_id=building["id"],
                    metadata={"zone_type": z.get("zone_type", "UNKNOWN")},
                    radars_count=zone_radar_count
                ))
            
            building_nodes.append(TreeNode(
                id=building["id"],
                name=building.get("name", "Bâtiment"),
                type="building",
                parent_id=client_id,
                children=floor_nodes + building_zone_nodes,
                metadata={},
                radars_count=building.get("radars_count", 0)
            ))
        
        return building_nodes
    
    # ==================== LOCATION PATH ====================
    
    async def get_event_location_path(self, sensor_id: str) -> LocationPath:
        """Get full location path for an event's sensor"""
        radar = await self.db.sensors.find_one({"id": sensor_id}, {"_id": 0})
        if not radar:
            return LocationPath(full_path="Capteur inconnu")
        
        path = LocationPath()
        parts = []
        
        if radar.get("client_id"):
            client = await self.db.clients.find_one({"id": radar["client_id"]}, {"name": 1})
            if client:
                path.client_id = radar["client_id"]
                path.client_name = client["name"]
                parts.append(client["name"])
        
        if radar.get("building_id"):
            building = await self.db.buildings.find_one({"id": radar["building_id"]}, {"name": 1})
            if building:
                path.building_id = radar["building_id"]
                path.building_name = building["name"]
                parts.append(building["name"])
        
        if radar.get("floor_id"):
            floor = await self.db.floors.find_one({"id": radar["floor_id"]}, {"name": 1, "index": 1})
            if floor:
                path.floor_id = radar["floor_id"]
                path.floor_name = floor["name"]
                path.floor_index = floor.get("index")
                parts.append(floor["name"])
        
        if radar.get("zone_id"):
            zone = await self.db.zones_new.find_one({"id": radar["zone_id"]}, {"name": 1, "zone_type": 1})
            if zone:
                path.zone_id = radar["zone_id"]
                path.zone_name = zone["name"]
                path.zone_type = zone.get("zone_type")
                parts.append(f"Zone: {zone['name']}")
        
        if radar.get("room_id"):
            room = await self.db.rooms.find_one({"id": radar["room_id"]}, {"room_number": 1, "name": 1})
            if room:
                path.room_id = radar["room_id"]
                path.room_number = room["room_number"]
                path.room_name = room.get("name")
                parts.append(f"Ch. {room['room_number']}")
        
        if radar.get("room_space_id"):
            space = await self.db.room_spaces.find_one({"id": radar["room_space_id"]}, {"space_type": 1, "name": 1})
            if space:
                path.space_id = radar["room_space_id"]
                path.space_type = space["space_type"]
                path.space_name = space.get("name")
                parts.append(space.get("name") or space["space_type"])
        
        path.full_path = " > ".join(parts) if parts else "Non localisé"
        return path


# Singleton instance
clients_buildings_service: Optional[ClientsBuildingsService] = None


def init_clients_buildings_service(db: AsyncIOMotorDatabase):
    """Initialize the service"""
    global clients_buildings_service
    clients_buildings_service = ClientsBuildingsService(db)
    return clients_buildings_service


def get_clients_buildings_service() -> ClientsBuildingsService:
    """Get the service instance"""
    if clients_buildings_service is None:
        raise RuntimeError("Service not initialized")
    return clients_buildings_service
