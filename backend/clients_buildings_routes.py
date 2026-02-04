"""
Clients & Buildings API Routes
Multi-tenant hierarchical structure management endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List

from clients_buildings_models import (
    ClientCreate, ClientUpdate,
    BuildingCreate, BuildingUpdate,
    FloorCreate, FloorUpdate,
    RoomCreate, RoomUpdate,
    RoomSpaceCreate, RoomSpaceUpdate,
    ZoneCreateNew, ZoneUpdateNew,
    RadarAssignRequest, ClientUserCreate, ClientUserUpdate
)
from clients_buildings_service import get_clients_buildings_service, ClientsBuildingsService
from rbac_service import get_rbac_service


def create_clients_buildings_router(get_current_user, check_permission, db, get_password_hash=None):
    """Factory function to create router with dependencies"""

    router = APIRouter(tags=["Clients & Buildings"])

    def get_service() -> ClientsBuildingsService:
        return get_clients_buildings_service()

    async def check_rbac_permission(user, client_id: str, permission_key: str) -> bool:
        """Vérifier les permissions RBAC d'un utilisateur sur un client. Retourne True si autorisé."""
        if user.role == "SUPER_ADMIN":
            return True

        rbac = get_rbac_service()
        if rbac:
            has_perm = await rbac.has_permission(user.id, client_id, permission_key)
            if has_perm:
                return True

        # Repli sur le rôle système pour TENANT_ADMIN
        if user.role == "TENANT_ADMIN" and user.tenant_id == client_id:
            return True

        return False
    
    # ==================== CLIENTS ====================
    
    @router.get("/clients")
    async def list_clients(current_user = Depends(get_current_user)):
        """List all clients (filtered by user access)"""
        service = get_service()
        
        if current_user.role == "SUPER_ADMIN":
            # Super admin sees all clients
            return await service.list_clients()
        else:
            # For other users, return only their associated clients
            # First check if user has client associations via client_users
            client_users = await db.client_users.find(
                {"user_id": current_user.id, "is_active": True},
                {"_id": 0, "client_id": 1}
            ).to_list(100)
            
            client_ids = [cu["client_id"] for cu in client_users]
            
            # Also include the user's tenant_id if it's a valid client
            if current_user.tenant_id:
                client_ids.append(current_user.tenant_id)
            
            client_ids = list(set(client_ids))  # Remove duplicates
            
            if not client_ids:
                return []
            
            # Fetch the clients
            clients = await db.clients.find(
                {"id": {"$in": client_ids}},
                {"_id": 0}
            ).to_list(100)
            
            return clients
    
    @router.post("/clients")
    async def create_client(data: ClientCreate, current_user = Depends(get_current_user)):
        """Create a new client (SUPER_ADMIN only)"""
        check_permission(current_user, ["SUPER_ADMIN"])
        service = get_service()
        return await service.create_client(data)
    
    @router.get("/clients/{client_id}")
    async def get_client(client_id: str, current_user = Depends(get_current_user)):
        """Get client details"""
        # Allow SUPER_ADMIN or users belonging to this client
        if current_user.role != "SUPER_ADMIN":
            # Check if user belongs to this client
            client_user = await db.client_users.find_one({
                "user_id": current_user.id,
                "client_id": client_id,
                "is_active": True
            })
            if not client_user and current_user.tenant_id != client_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        client = await service.get_client(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        return client
    
    @router.patch("/clients/{client_id}")
    async def update_client(client_id: str, data: ClientUpdate, current_user = Depends(get_current_user)):
        """Update a client"""
        # SUPER_ADMIN or CLIENT_ADMIN of this client
        if current_user.role != "SUPER_ADMIN":
            client_user = await db.client_users.find_one({
                "user_id": current_user.id,
                "client_id": client_id,
                "role": "CLIENT_ADMIN",
                "is_active": True
            })
            if not client_user:
                raise HTTPException(status_code=403, detail="Access denied")

        service = get_service()
        result = await service.update_client(client_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Client not found")
        return result

    @router.delete("/clients/{client_id}")
    async def delete_client(client_id: str, current_user = Depends(get_current_user)):
        """
        Supprimer un client et toutes les données associées (SUPER_ADMIN uniquement).
        Cette opération destructive supprime en cascade :
        - Bâtiments, étages, chambres, espaces, zones
        - Capteurs (désassociés, pas supprimés)
        - Utilisateurs client et leurs données RBAC
        - Règles d'alerte et journaux d'audit
        """
        # Seul SUPER_ADMIN peut supprimer des clients
        if current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Seul SUPER_ADMIN peut supprimer des clients")

        service = get_service()
        client = await service.get_client(client_id, include_stats=False)
        if not client:
            raise HTTPException(status_code=404, detail="Client non trouvé")

        summary = await service.delete_client(client_id)
        return {
            "message": f"Client '{client.get('name', client_id)}' supprimé avec succès",
            "summary": summary
        }

    @router.get("/clients/{client_id}/tree")
    async def get_client_tree(client_id: str, current_user = Depends(get_current_user)):
        """Get hierarchical tree view for a client"""
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        return await service.get_client_tree(client_id)
    
    # ==================== BUILDINGS ====================
    
    @router.get("/clients/{client_id}/buildings")
    async def list_buildings(client_id: str, current_user = Depends(get_current_user)):
        """List buildings for a client"""
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        return await service.list_buildings(client_id)
    
    @router.post("/clients/{client_id}/buildings")
    async def create_building(client_id: str, data: BuildingCreate, current_user = Depends(get_current_user)):
        """Create a new building"""
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != client_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Override client_id from path
        data.client_id = client_id
        service = get_service()
        return await service.create_building(client_id, data)
    
    @router.get("/buildings/{building_id}")
    async def get_building(building_id: str, current_user = Depends(get_current_user)):
        """Get building details"""
        service = get_service()
        building = await service.get_building(building_id)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != building["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return building
    
    @router.patch("/buildings/{building_id}")
    async def update_building(building_id: str, data: BuildingUpdate, current_user = Depends(get_current_user)):
        """Update a building"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != building["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.update_building(building_id, data)
    
    @router.delete("/buildings/{building_id}")
    async def delete_building(building_id: str, current_user = Depends(get_current_user)):
        """Delete a building and all its contents"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")

        # Vérification des permissions RBAC
        if not await check_rbac_permission(current_user, building["client_id"], "BUILDING_MANAGE"):
            raise HTTPException(status_code=403, detail="Accès refusé - Permission BUILDING_MANAGE requise")

        await service.delete_building(building_id)
        return {"message": "Bâtiment supprimé"}
    
    # ==================== FLOORS ====================
    
    @router.get("/buildings/{building_id}/floors")
    async def list_floors(building_id: str, current_user = Depends(get_current_user)):
        """List floors for a building"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != building["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.list_floors(building_id)
    
    @router.post("/buildings/{building_id}/floors")
    async def create_floor(building_id: str, data: FloorCreate, current_user = Depends(get_current_user)):
        """Create a new floor"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != building["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.create_floor(building_id, data)
    
    @router.get("/floors/{floor_id}")
    async def get_floor(floor_id: str, current_user = Depends(get_current_user)):
        """Get floor details"""
        service = get_service()
        floor = await service.get_floor(floor_id)
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != floor["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return floor
    
    @router.patch("/floors/{floor_id}")
    async def update_floor(floor_id: str, data: FloorUpdate, current_user = Depends(get_current_user)):
        """Update a floor"""
        service = get_service()
        floor = await service.get_floor(floor_id, include_stats=False)
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.update_floor(floor_id, data)
    
    @router.delete("/floors/{floor_id}")
    async def delete_floor(floor_id: str, current_user = Depends(get_current_user)):
        """Delete a floor"""
        service = get_service()
        floor = await service.get_floor(floor_id, include_stats=False)
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")

        # Vérification des permissions RBAC
        if not await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE"):
            raise HTTPException(status_code=403, detail="Accès refusé - Permission BUILDING_MANAGE requise")

        await service.delete_floor(floor_id)
        return {"message": "Étage supprimé"}
    
    # ==================== ROOMS ====================
    
    @router.get("/floors/{floor_id}/rooms")
    async def list_rooms(floor_id: str, current_user = Depends(get_current_user)):
        """List rooms for a floor"""
        service = get_service()
        floor = await service.get_floor(floor_id, include_stats=False)
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != floor["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.list_rooms(floor_id)
    
    @router.post("/floors/{floor_id}/rooms")
    async def create_room(floor_id: str, data: RoomCreate, current_user = Depends(get_current_user)):
        """Create a new room"""
        service = get_service()
        floor = await service.get_floor(floor_id, include_stats=False)
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        try:
            return await service.create_room(floor_id, data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    @router.get("/rooms/{room_id}")
    async def get_room(room_id: str, current_user = Depends(get_current_user)):
        """Get room details with spaces"""
        service = get_service()
        room = await service.get_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != room["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return room
    
    @router.patch("/rooms/{room_id}")
    async def update_room(room_id: str, data: RoomUpdate, current_user = Depends(get_current_user)):
        """Update a room"""
        service = get_service()
        room = await service.get_room(room_id, include_spaces=False)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != room["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        try:
            return await service.update_room(room_id, data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    @router.delete("/rooms/{room_id}")
    async def delete_room(room_id: str, current_user = Depends(get_current_user)):
        """Delete a room"""
        service = get_service()
        room = await service.get_room(room_id, include_spaces=False)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        # Vérification des permissions RBAC
        if not await check_rbac_permission(current_user, room["client_id"], "BUILDING_MANAGE"):
            raise HTTPException(status_code=403, detail="Accès refusé - Permission BUILDING_MANAGE requise")

        await service.delete_room(room_id)
        return {"message": "Chambre supprimée"}
    
    # ==================== ROOM SPACES ====================
    
    @router.post("/rooms/{room_id}/spaces")
    async def add_room_space(room_id: str, data: RoomSpaceCreate, current_user = Depends(get_current_user)):
        """Add a space to a room"""
        service = get_service()
        room = await service.get_room(room_id, include_spaces=False)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != room["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        try:
            return await service.add_room_space(room_id, data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    @router.patch("/room-spaces/{space_id}")
    async def update_room_space(space_id: str, data: RoomSpaceUpdate, current_user = Depends(get_current_user)):
        """Update a room space"""
        space = await db.room_spaces.find_one({"id": space_id}, {"_id": 0})
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != space["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        return await service.update_room_space(space_id, data)
    
    @router.delete("/room-spaces/{space_id}")
    async def delete_room_space(space_id: str, current_user = Depends(get_current_user)):
        """Delete a room space"""
        space = await db.room_spaces.find_one({"id": space_id}, {"_id": 0})
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")

        # Vérification des permissions RBAC
        if not await check_rbac_permission(current_user, space["client_id"], "BUILDING_MANAGE"):
            raise HTTPException(status_code=403, detail="Accès refusé - Permission BUILDING_MANAGE requise")

        service = get_service()
        await service.delete_room_space(space_id)
        return {"message": "Espace supprimé"}
    
    # ==================== ZONES ====================
    
    @router.get("/buildings/{building_id}/zones")
    async def list_zones(
        building_id: str, 
        floor_id: Optional[str] = None,
        current_user = Depends(get_current_user)
    ):
        """List zones for a building"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != building["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.list_zones(building_id, floor_id)
    
    @router.post("/buildings/{building_id}/zones")
    async def create_zone(building_id: str, data: ZoneCreateNew, current_user = Depends(get_current_user)):
        """Create a new zone"""
        service = get_service()
        building = await service.get_building(building_id, include_stats=False)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != building["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.create_zone(building_id, data)
    
    @router.get("/zones/{zone_id}")
    async def get_zone(zone_id: str, current_user = Depends(get_current_user)):
        """Get zone details"""
        service = get_service()
        zone = await service.get_zone(zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != zone["client_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return zone
    
    @router.patch("/zones/{zone_id}")
    async def update_zone(zone_id: str, data: ZoneUpdateNew, current_user = Depends(get_current_user)):
        """Update a zone"""
        service = get_service()
        zone = await service.get_zone(zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN"])
            if current_user.tenant_id != zone["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.update_zone(zone_id, data)
    
    @router.delete("/zones/{zone_id}")
    async def delete_zone(zone_id: str, current_user = Depends(get_current_user)):
        """Delete a zone"""
        service = get_service()
        zone = await service.get_zone(zone_id)
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")

        # Vérification des permissions RBAC
        if not await check_rbac_permission(current_user, zone["client_id"], "BUILDING_MANAGE"):
            raise HTTPException(status_code=403, detail="Accès refusé - Permission BUILDING_MANAGE requise")

        await service.delete_zone(zone_id)
        return {"message": "Zone supprimée"}
    
    # ==================== RADAR ASSIGNMENT ====================
    
    @router.get("/clients/{client_id}/radars")
    async def list_client_radars(
        client_id: str,
        building_id: Optional[str] = None,
        floor_id: Optional[str] = None,
        unassigned: bool = False,
        current_user = Depends(get_current_user)
    ):
        """List radars for a client with optional filters"""
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != client_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        query = {"client_id": client_id}
        if building_id:
            query["building_id"] = building_id
        if floor_id:
            query["floor_id"] = floor_id
        if unassigned:
            query["$and"] = [
                {"room_id": None},
                {"room_space_id": None},
                {"zone_id": None}
            ]
        
        radars = await db.sensors.find(query, {"_id": 0}).to_list(1000)
        
        # Add location info
        service = get_service()
        for radar in radars:
            location = await service.get_radar_location(radar["id"])
            radar["location"] = location.model_dump()
            radar["location_path"] = location.get_path()
        
        return radars
    
    @router.post("/radars/{radar_id}/assign")
    async def assign_radar(radar_id: str, data: RadarAssignRequest, current_user = Depends(get_current_user)):
        """Assign a radar to a location"""
        radar = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise HTTPException(status_code=404, detail="Radar not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN", "SUPERVISOR"])
            if current_user.tenant_id != radar.get("client_id"):
                raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        try:
            return await service.assign_radar(radar_id, data, current_user.id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    @router.post("/radars/{radar_id}/unassign")
    async def unassign_radar(
        radar_id: str, 
        reason: Optional[str] = None,
        current_user = Depends(get_current_user)
    ):
        """Unassign a radar from its current location"""
        radar = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise HTTPException(status_code=404, detail="Radar not found")
        
        if current_user.role != "SUPER_ADMIN":
            check_permission(current_user, ["TENANT_ADMIN", "SUPERVISOR"])
            if current_user.tenant_id != radar.get("client_id"):
                raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        return await service.unassign_radar(radar_id, current_user.id, reason)
    
    @router.get("/radars/{radar_id}/assignments")
    async def get_radar_assignments(radar_id: str, current_user = Depends(get_current_user)):
        """Get assignment history for a radar"""
        radar = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise HTTPException(status_code=404, detail="Radar not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != radar.get("client_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        return await service.get_radar_assignment_history(radar_id)
    
    @router.get("/radars/{radar_id}/location")
    async def get_radar_location_endpoint(radar_id: str, current_user = Depends(get_current_user)):
        """Get current location for a radar"""
        radar = await db.sensors.find_one({"id": radar_id}, {"_id": 0})
        if not radar:
            raise HTTPException(status_code=404, detail="Radar not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != radar.get("client_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        location = await service.get_radar_location(radar_id)
        return {
            "location": location.model_dump(),
            "path": location.get_path()
        }
    
    # ==================== EVENT LOCATION ====================
    
    @router.get("/events/{event_id}/location")
    async def get_event_location(event_id: str, current_user = Depends(get_current_user)):
        """Get location path for an event"""
        event = await db.events.find_one({"id": event_id}, {"_id": 0})
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if current_user.role != "SUPER_ADMIN" and current_user.tenant_id != event.get("tenant_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        
        service = get_service()
        if event.get("sensor_id"):
            path = await service.get_event_location_path(event["sensor_id"])
            return path.model_dump()
        
        return {"full_path": "Capteur inconnu"}
    
    # ==================== ORGANISATIONS (ALIAS) ====================
    # Ces routes sont des alias vers les routes clients pour le renommage UI
    
    @router.get("/organisations")
    async def list_organisations(current_user = Depends(get_current_user)):
        """List all organisations (alias for clients)"""
        service = get_service()
        
        if current_user.role == "SUPER_ADMIN":
            return await service.list_clients()
        else:
            client_users = await db.client_users.find(
                {"user_id": current_user.id, "is_active": True},
                {"_id": 0, "client_id": 1}
            ).to_list(100)
            
            if client_users:
                client_ids = [cu["client_id"] for cu in client_users]
                return await service.list_clients(client_ids=client_ids)
            
            if current_user.tenant_id:
                return await service.list_clients(client_ids=[current_user.tenant_id])
            
            return []
    
    @router.get("/organisations/{org_id}")
    async def get_organisation(org_id: str, current_user = Depends(get_current_user)):
        """Get organisation details (alias for client)"""
        service = get_service()
        client = await service.get_client(org_id)
        if not client:
            raise HTTPException(status_code=404, detail="Organisation not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, org_id, "VIEW")
            if not has_access and current_user.tenant_id != org_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return client
    
    @router.get("/organisations/{org_id}/buildings")
    async def list_organisation_buildings(org_id: str, current_user = Depends(get_current_user)):
        """List buildings for an organisation (alias)"""
        service = get_service()
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, org_id, "VIEW")
            if not has_access and current_user.tenant_id != org_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.list_buildings(org_id)
    
    @router.get("/organisations/{org_id}/sensors")
    async def list_organisation_sensors(org_id: str, current_user = Depends(get_current_user)):
        """List all sensors (capteurs) for an organisation"""
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, org_id, "VIEW")
            if not has_access and current_user.tenant_id != org_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        sensors = await db.sensors.find(
            {"client_id": org_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Enrichir avec le type de capteur pour l'UI
        for sensor in sensors:
            sensor["sensor_type_label"] = _get_sensor_type_label(sensor.get("type"))
        
        return sensors
    
    # ==================== SENSORS BY LOCATION ====================
    
    @router.get("/buildings/{building_id}/sensors")
    async def list_building_sensors(building_id: str, current_user = Depends(get_current_user)):
        """List all sensors (capteurs) in a building"""
        # Vérifier que le bâtiment existe
        building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, building["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != building["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        sensors = await db.sensors.find(
            {"building_id": building_id},
            {"_id": 0}
        ).to_list(1000)
        
        for sensor in sensors:
            sensor["sensor_type_label"] = _get_sensor_type_label(sensor.get("type"))
        
        return sensors
    
    @router.get("/floors/{floor_id}/sensors")
    async def list_floor_sensors(floor_id: str, current_user = Depends(get_current_user)):
        """List all sensors (capteurs) on a floor"""
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        sensors = await db.sensors.find(
            {"floor_id": floor_id},
            {"_id": 0}
        ).to_list(1000)
        
        for sensor in sensors:
            sensor["sensor_type_label"] = _get_sensor_type_label(sensor.get("type"))
        
        return sensors
    
    @router.get("/floors/{floor_id}/zones")
    async def list_floor_zones(floor_id: str, current_user = Depends(get_current_user)):
        """List all zones on a floor"""
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Zones avec floor_id correspondant OU zones sans floor_id du même building
        zones = await db.zones_new.find(
            {"$or": [
                {"floor_id": floor_id},
                {"floor_id": None, "building_id": floor["building_id"]}
            ]},
            {"_id": 0}
        ).to_list(100)
        
        # Enrichir avec compteurs
        for zone in zones:
            # Compter les chambres dans cette zone (si zone_id existe dans rooms)
            rooms_count = await db.rooms.count_documents({"zone_id": zone["id"]}) if zone.get("id") else 0
            zone["rooms_count"] = rooms_count
            
            # Compter les capteurs via les chambres de la zone
            if rooms_count > 0:
                rooms = await db.rooms.find({"zone_id": zone["id"]}, {"_id": 0, "id": 1}).to_list(1000)
                room_ids = [r["id"] for r in rooms]
                sensors_count = await db.sensors.count_documents({"room_id": {"$in": room_ids}})
                zone["sensors_count"] = sensors_count
            else:
                zone["sensors_count"] = 0
        
        return zones
    
    @router.get("/rooms/{room_id}/sensors")
    async def list_room_sensors(room_id: str, current_user = Depends(get_current_user)):
        """List all sensors (capteurs) in a room"""
        room = await db.rooms.find_one({"id": room_id}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, room["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != room["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        sensors = await db.sensors.find(
            {"room_id": room_id},
            {"_id": 0}
        ).to_list(100)
        
        for sensor in sensors:
            sensor["sensor_type_label"] = _get_sensor_type_label(sensor.get("type"))
        
        return sensors
    
    @router.get("/room-spaces/{space_id}/sensors")
    async def list_space_sensors(space_id: str, current_user = Depends(get_current_user)):
        """List all sensors (capteurs) in a room space"""
        space = await db.room_spaces.find_one({"id": space_id}, {"_id": 0})
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, space["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != space["client_id"]:
                raise HTTPException(status_code=403, detail="Access denied")
        
        sensors = await db.sensors.find(
            {"room_space_id": space_id},
            {"_id": 0}
        ).to_list(100)
        
        for sensor in sensors:
            sensor["sensor_type_label"] = _get_sensor_type_label(sensor.get("type"))
        
        return sensors
    
    # ==================== HIERARCHY TREE ====================
    
    @router.get("/organisations/{org_id}/tree")
    async def get_organisation_tree(org_id: str, current_user = Depends(get_current_user)):
        """Get full hierarchy tree for an organisation (alias)"""
        service = get_service()
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, org_id, "VIEW")
            if not has_access and current_user.tenant_id != org_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return await service.get_client_tree(org_id)
    
    # ==================== STATS CAPTEURS ====================
    
    @router.get("/organisations/{org_id}/stats")
    async def get_organisation_stats(org_id: str, current_user = Depends(get_current_user)):
        """Get statistics for an organisation"""
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, org_id, "VIEW")
            if not has_access and current_user.tenant_id != org_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Compteurs dynamiques
        buildings_count = await db.buildings.count_documents({"client_id": org_id})
        floors_count = await db.floors.count_documents({"client_id": org_id})
        rooms_count = await db.rooms.count_documents({"client_id": org_id})
        zones_count = await db.zones_new.count_documents({"client_id": org_id})
        sensors_count = await db.sensors.count_documents({"client_id": org_id})
        sensors_online = await db.sensors.count_documents({"client_id": org_id, "status": "ONLINE"})
        
        return {
            "organisation_id": org_id,
            "buildings_count": buildings_count,
            "floors_count": floors_count,
            "rooms_count": rooms_count,
            "zones_count": zones_count,
            "sensors_count": sensors_count,
            "sensors_online": sensors_online,
            "sensors_offline": sensors_count - sensors_online
        }
    
    # ==================== FLOOR PLANS ====================
    
    @router.post("/floors/{floor_id}/plan")
    async def upload_floor_plan(
        floor_id: str, 
        file: UploadFile = File(...),
        current_user = Depends(get_current_user)
    ):
        """Upload a floor plan image or PDF"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        # Check permissions
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE")
            if not has_access:
                raise HTTPException(status_code=403, detail="Permission BUILDING_MANAGE requise")
        
        service = get_floor_plan_service(db)
        return await service.upload_floor_plan(floor_id, file, current_user.id)
    
    @router.get("/floors/{floor_id}/plan")
    async def get_floor_plan(floor_id: str, current_user = Depends(get_current_user)):
        """Get floor plan metadata"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Accès refusé")
        
        service = get_floor_plan_service(db)
        plan = await service.get_floor_plan(floor_id)
        if not plan:
            raise HTTPException(status_code=404, detail="Aucun plan pour cet étage")
        
        return plan
    
    @router.get("/floors/{floor_id}/plan/image")
    async def get_floor_plan_image(floor_id: str, current_user = Depends(get_current_user)):
        """Get floor plan image file"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Accès refusé")
        
        service = get_floor_plan_service(db)
        file_path = await service.get_floor_plan_image_path(floor_id)
        if not file_path:
            raise HTTPException(status_code=404, detail="Image du plan non trouvée")
        
        return FileResponse(file_path, media_type="image/png")
    
    @router.delete("/floors/{floor_id}/plan")
    async def delete_floor_plan(floor_id: str, current_user = Depends(get_current_user)):
        """Delete a floor plan"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE")
            if not has_access:
                raise HTTPException(status_code=403, detail="Permission BUILDING_MANAGE requise")
        
        service = get_floor_plan_service(db)
        deleted = await service.delete_floor_plan(floor_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Aucun plan à supprimer")
        
        return {"message": "Plan supprimé avec succès"}
    
    @router.get("/buildings/{building_id}/plans")
    async def list_building_plans(building_id: str, current_user = Depends(get_current_user)):
        """List all floor plans for a building"""
        from floor_plan_service import get_floor_plan_service
        
        building = await db.buildings.find_one({"id": building_id}, {"_id": 0})
        if not building:
            raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, building["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != building["client_id"]:
                raise HTTPException(status_code=403, detail="Accès refusé")
        
        service = get_floor_plan_service(db)
        return await service.list_floor_plans(building_id)
    
    # ==================== FLOOR PLAN MARKERS ====================
    
    @router.get("/floors/{floor_id}/sensors-markers")
    async def get_floor_sensors_with_markers(floor_id: str, current_user = Depends(get_current_user)):
        """Get all sensors for a floor with their marker positions"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "VIEW")
            if not has_access and current_user.tenant_id != floor["client_id"]:
                raise HTTPException(status_code=403, detail="Accès refusé")
        
        service = get_floor_plan_service(db)
        return await service.get_floor_sensors(floor_id)
    
    @router.put("/floors/{floor_id}/markers/{sensor_id}")
    async def update_sensor_marker(
        floor_id: str, 
        sensor_id: str,
        x: float = Query(..., ge=0, le=100),
        y: float = Query(..., ge=0, le=100),
        current_user = Depends(get_current_user)
    ):
        """Update a sensor marker position on the floor plan"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE")
            if not has_access:
                raise HTTPException(status_code=403, detail="Permission BUILDING_MANAGE requise")
        
        service = get_floor_plan_service(db)
        return await service.update_sensor_marker(floor_id, sensor_id, x, y)
    
    @router.delete("/floors/{floor_id}/markers/{sensor_id}")
    async def remove_sensor_marker(
        floor_id: str, 
        sensor_id: str,
        current_user = Depends(get_current_user)
    ):
        """Remove a sensor marker from the floor plan"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE")
            if not has_access:
                raise HTTPException(status_code=403, detail="Permission BUILDING_MANAGE requise")
        
        service = get_floor_plan_service(db)
        removed = await service.remove_sensor_marker(floor_id, sensor_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Marqueur non trouvé")
        
        return {"message": "Marqueur supprimé"}
    
    @router.put("/floors/{floor_id}/markers")
    async def update_all_markers(
        floor_id: str,
        markers: list,
        current_user = Depends(get_current_user)
    ):
        """Update all markers at once (batch update)"""
        from floor_plan_service import get_floor_plan_service
        
        floor = await db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        if current_user.role != "SUPER_ADMIN":
            has_access = await check_rbac_permission(current_user, floor["client_id"], "BUILDING_MANAGE")
            if not has_access:
                raise HTTPException(status_code=403, detail="Permission BUILDING_MANAGE requise")
        
        service = get_floor_plan_service(db)
        return await service.update_all_markers(floor_id, markers)
    
    return router


def _get_sensor_type_label(sensor_type: str, lang: str = "fr") -> str:
    """Get human-readable label for sensor type"""
    labels = {
        "fr": {
            "RADAR": "Radar de détection de chute",
            "CAMERA": "Caméra",
            "MOTION": "Détecteur de mouvement",
            "DOOR": "Capteur de porte",
            "OTHER": "Autre"
        },
        "en": {
            "RADAR": "Fall detection radar",
            "CAMERA": "Camera",
            "MOTION": "Motion detector",
            "DOOR": "Door sensor",
            "OTHER": "Other"
        }
    }
    return labels.get(lang, labels["fr"]).get(sensor_type, sensor_type or "Inconnu")
