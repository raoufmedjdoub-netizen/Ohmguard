"""
RBAC Service - Role-Based Access Control with Location Scopes
=============================================================

This service provides:
- Permission checking (role defaults + user overrides)
- Scope-based data filtering
- Guards for API endpoints
- Effective access computation

Usage:
    from rbac_service import RBACService, require_permission, require_scope

    @api_router.get("/events")
    @require_permission("EVENT_VIEW")
    async def list_events(current_user: UserInDB = Depends(get_current_user)):
        # User has EVENT_VIEW permission
        pass
"""

import logging
from typing import Optional, List, Set, Dict, Any, Callable
from functools import wraps
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, Depends, Request

from rbac_models import (
    ClientRole, PermissionEffect, ScopeType, AccessLevel,
    Permission, ClientUser, UserPermissionOverride, LocationScope,
    LocationScopeWithDetails, PermissionStatus, EffectiveAccessSummary,
    PERMISSIONS_CATALOG, ROLE_PERMISSIONS,
    RBACActionType, RBACAuditLog
)

logger = logging.getLogger(__name__)


class RBACService:
    """Service for RBAC operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # =========================================================================
    # PERMISSIONS CATALOG
    # =========================================================================
    
    async def init_permissions_catalog(self):
        """Initialize permissions catalog in database"""
        existing = await self.db.permissions.count_documents({})
        if existing > 0:
            logger.info(f"Permissions catalog already initialized ({existing} permissions)")
            return
        
        for perm_data in PERMISSIONS_CATALOG:
            perm = Permission(
                key=perm_data["key"],
                label=perm_data["label"],
                description=perm_data.get("description"),
                group=perm_data["group"]
            )
            await self.db.permissions.insert_one(perm.model_dump())
        
        logger.info(f"Initialized {len(PERMISSIONS_CATALOG)} permissions")
    
    async def get_permissions_catalog(self) -> List[dict]:
        """Get all permissions grouped by category"""
        permissions = await self.db.permissions.find({}, {"_id": 0}).to_list(1000)
        return permissions
    
    async def get_role_default_permissions(self, role: ClientRole) -> List[str]:
        """Get default permissions for a role"""
        return ROLE_PERMISSIONS.get(role, [])
    
    # =========================================================================
    # CLIENT USER MANAGEMENT
    # =========================================================================
    
    async def get_client_user(self, client_id: str, user_id: str) -> Optional[dict]:
        """Get ClientUser for a user in a client"""
        return await self.db.client_users.find_one(
            {"client_id": client_id, "user_id": user_id},
            {"_id": 0}
        )
    
    async def get_client_user_by_id(self, client_user_id: str) -> Optional[dict]:
        """Get ClientUser by ID"""
        return await self.db.client_users.find_one(
            {"id": client_user_id},
            {"_id": 0}
        )
    
    async def create_client_user(
        self, 
        client_id: str, 
        user_id: str, 
        role: ClientRole,
        created_by: Optional[str] = None
    ) -> dict:
        """Create a new ClientUser"""
        # Check if already exists
        existing = await self.get_client_user(client_id, user_id)
        if existing:
            raise HTTPException(status_code=400, detail="User already belongs to this client")
        
        client_user = ClientUser(
            client_id=client_id,
            user_id=user_id,
            role=role
        )
        
        await self.db.client_users.insert_one(client_user.model_dump())
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.ROLE_CHANGE,
            user_id,
            client_user.id,
            created_by or "system",
            client_id,
            {"new_role": role, "action": "create"}
        )
        
        return client_user.model_dump()
    
    async def update_client_user_role(
        self,
        client_user_id: str,
        new_role: ClientRole,
        updated_by: str
    ) -> dict:
        """Update a ClientUser's role"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        old_role = client_user.get("role")
        
        await self.db.client_users.update_one(
            {"id": client_user_id},
            {"$set": {
                "role": new_role,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.ROLE_CHANGE,
            client_user["user_id"],
            client_user_id,
            updated_by,
            client_user["client_id"],
            {"old_role": old_role, "new_role": new_role}
        )
        
        return await self.get_client_user_by_id(client_user_id)
    
    async def list_client_users(self, client_id: str) -> List[dict]:
        """List all users for a client with details"""
        client_users = await self.db.client_users.find(
            {"client_id": client_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Enrich with user details
        for cu in client_users:
            user = await self.db.users.find_one(
                {"id": cu["user_id"]},
                {"_id": 0, "email": 1, "full_name": 1}
            )
            if user:
                cu["user_email"] = user.get("email")
                cu["user_full_name"] = user.get("full_name")
            
            # Count overrides and scopes
            cu["permissions_count"] = await self.db.permission_overrides.count_documents(
                {"client_user_id": cu["id"]}
            )
            cu["scopes_count"] = await self.db.location_scopes.count_documents(
                {"client_user_id": cu["id"]}
            )
        
        return client_users
    
    # =========================================================================
    # PERMISSION OVERRIDES
    # =========================================================================
    
    async def get_user_permission_overrides(self, client_user_id: str) -> List[dict]:
        """Get all permission overrides for a user"""
        return await self.db.permission_overrides.find(
            {"client_user_id": client_user_id},
            {"_id": 0}
        ).to_list(1000)
    
    async def set_permission_override(
        self,
        client_user_id: str,
        permission_key: str,
        effect: PermissionEffect,
        created_by: str
    ) -> dict:
        """Set or update a permission override"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        # Upsert the override
        existing = await self.db.permission_overrides.find_one(
            {"client_user_id": client_user_id, "permission_key": permission_key}
        )
        
        if existing:
            await self.db.permission_overrides.update_one(
                {"id": existing["id"]},
                {"$set": {"effect": effect}}
            )
            override_id = existing["id"]
        else:
            override = UserPermissionOverride(
                client_user_id=client_user_id,
                permission_key=permission_key,
                effect=effect,
                created_by=created_by
            )
            await self.db.permission_overrides.insert_one(override.model_dump())
            override_id = override.id
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.PERMISSION_OVERRIDE_ADD,
            client_user["user_id"],
            client_user_id,
            created_by,
            client_user["client_id"],
            {"permission_key": permission_key, "effect": effect}
        )
        
        return await self.db.permission_overrides.find_one(
            {"id": override_id},
            {"_id": 0}
        )
    
    async def remove_permission_override(
        self,
        client_user_id: str,
        permission_key: str,
        removed_by: str
    ):
        """Remove a permission override (revert to role default)"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        result = await self.db.permission_overrides.delete_one(
            {"client_user_id": client_user_id, "permission_key": permission_key}
        )
        
        if result.deleted_count > 0:
            await self._log_rbac_action(
                RBACActionType.PERMISSION_OVERRIDE_REMOVE,
                client_user["user_id"],
                client_user_id,
                removed_by,
                client_user["client_id"],
                {"permission_key": permission_key}
            )
    
    async def bulk_update_permission_overrides(
        self,
        client_user_id: str,
        overrides: List[dict],
        updated_by: str
    ):
        """Replace all permission overrides for a user"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        # Delete existing overrides
        await self.db.permission_overrides.delete_many(
            {"client_user_id": client_user_id}
        )
        
        # Insert new overrides
        for override_data in overrides:
            override = UserPermissionOverride(
                client_user_id=client_user_id,
                permission_key=override_data["permission_key"],
                effect=override_data["effect"],
                created_by=updated_by
            )
            await self.db.permission_overrides.insert_one(override.model_dump())
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.PERMISSION_OVERRIDE_ADD,
            client_user["user_id"],
            client_user_id,
            updated_by,
            client_user["client_id"],
            {"bulk_update": True, "count": len(overrides)}
        )
    
    # =========================================================================
    # LOCATION SCOPES
    # =========================================================================
    
    async def get_user_scopes(self, client_user_id: str) -> List[dict]:
        """Get all location scopes for a user with details"""
        scopes = await self.db.location_scopes.find(
            {"client_user_id": client_user_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Enrich with location names
        for scope in scopes:
            await self._enrich_scope_with_names(scope)
        
        return scopes
    
    async def _enrich_scope_with_names(self, scope: dict):
        """Add location names to a scope"""
        path_parts = []
        
        if scope.get("client_id"):
            client = await self.db.clients.find_one(
                {"id": scope["client_id"]},
                {"_id": 0, "name": 1}
            )
            scope["client_name"] = client.get("name") if client else None
            if scope["client_name"]:
                path_parts.append(scope["client_name"])
        
        if scope.get("building_id"):
            building = await self.db.buildings.find_one(
                {"id": scope["building_id"]},
                {"_id": 0, "name": 1}
            )
            scope["building_name"] = building.get("name") if building else None
            if scope["building_name"]:
                path_parts.append(scope["building_name"])
        
        if scope.get("floor_id"):
            floor = await self.db.floors.find_one(
                {"id": scope["floor_id"]},
                {"_id": 0, "name": 1}
            )
            scope["floor_name"] = floor.get("name") if floor else None
            if scope["floor_name"]:
                path_parts.append(scope["floor_name"])
        
        if scope.get("zone_id"):
            zone = await self.db.zones.find_one(
                {"id": scope["zone_id"]},
                {"_id": 0, "name": 1}
            )
            scope["zone_name"] = zone.get("name") if zone else None
            if scope["zone_name"]:
                path_parts.append(scope["zone_name"])
        
        if scope.get("room_id"):
            room = await self.db.rooms.find_one(
                {"id": scope["room_id"]},
                {"_id": 0, "name": 1, "room_number": 1}
            )
            if room:
                scope["room_name"] = room.get("name") or f"Ch. {room.get('room_number')}"
                path_parts.append(scope["room_name"])
        
        if scope.get("room_space_id"):
            space = await self.db.room_spaces.find_one(
                {"id": scope["room_space_id"]},
                {"_id": 0, "name": 1}
            )
            scope["room_space_name"] = space.get("name") if space else None
            if scope["room_space_name"]:
                path_parts.append(scope["room_space_name"])
        
        scope["display_path"] = " > ".join(path_parts) if path_parts else "Non défini"
    
    async def add_scope(
        self,
        client_user_id: str,
        scope_data: dict,
        created_by: str
    ) -> dict:
        """Add a location scope for a user"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        scope = LocationScope(
            client_user_id=client_user_id,
            scope_type=scope_data["scope_type"],
            client_id=scope_data.get("client_id"),
            building_id=scope_data.get("building_id"),
            floor_id=scope_data.get("floor_id"),
            zone_id=scope_data.get("zone_id"),
            room_id=scope_data.get("room_id"),
            room_space_id=scope_data.get("room_space_id"),
            access_level=scope_data.get("access_level", AccessLevel.VIEW),
            created_by=created_by
        )
        
        await self.db.location_scopes.insert_one(scope.model_dump())
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.SCOPE_ADD,
            client_user["user_id"],
            client_user_id,
            created_by,
            client_user["client_id"],
            {"scope": scope_data}
        )
        
        result = scope.model_dump()
        await self._enrich_scope_with_names(result)
        return result
    
    async def remove_scope(
        self,
        scope_id: str,
        removed_by: str
    ):
        """Remove a location scope"""
        scope = await self.db.location_scopes.find_one(
            {"id": scope_id},
            {"_id": 0}
        )
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")
        
        client_user = await self.get_client_user_by_id(scope["client_user_id"])
        
        await self.db.location_scopes.delete_one({"id": scope_id})
        
        if client_user:
            await self._log_rbac_action(
                RBACActionType.SCOPE_REMOVE,
                client_user["user_id"],
                scope["client_user_id"],
                removed_by,
                client_user["client_id"],
                {"scope_id": scope_id}
            )
    
    async def bulk_update_scopes(
        self,
        client_user_id: str,
        scopes: List[dict],
        updated_by: str
    ):
        """Replace all scopes for a user"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        # Delete existing scopes
        await self.db.location_scopes.delete_many(
            {"client_user_id": client_user_id}
        )
        
        # Insert new scopes
        for scope_data in scopes:
            scope = LocationScope(
                client_user_id=client_user_id,
                scope_type=scope_data["scope_type"],
                client_id=scope_data.get("client_id"),
                building_id=scope_data.get("building_id"),
                floor_id=scope_data.get("floor_id"),
                zone_id=scope_data.get("zone_id"),
                room_id=scope_data.get("room_id"),
                room_space_id=scope_data.get("room_space_id"),
                access_level=scope_data.get("access_level", AccessLevel.VIEW),
                created_by=updated_by
            )
            await self.db.location_scopes.insert_one(scope.model_dump())
        
        # Audit log
        await self._log_rbac_action(
            RBACActionType.SCOPE_ADD,
            client_user["user_id"],
            client_user_id,
            updated_by,
            client_user["client_id"],
            {"bulk_update": True, "count": len(scopes)}
        )
    
    # =========================================================================
    # PERMISSION CHECKING
    # =========================================================================
    
    async def has_permission(
        self,
        user_id: str,
        client_id: str,
        permission_key: str
    ) -> bool:
        """Check if a user has a specific permission"""
        # Get ClientUser
        client_user = await self.get_client_user(client_id, user_id)
        if not client_user:
            return False
        
        # CLIENT_ADMIN has all permissions by default
        if client_user.get("role") == ClientRole.CLIENT_ADMIN:
            # Check for explicit DENY override
            override = await self.db.permission_overrides.find_one({
                "client_user_id": client_user["id"],
                "permission_key": permission_key,
                "effect": PermissionEffect.DENY
            })
            return override is None
        
        # Check for DENY override first (DENY always wins)
        deny_override = await self.db.permission_overrides.find_one({
            "client_user_id": client_user["id"],
            "permission_key": permission_key,
            "effect": PermissionEffect.DENY
        })
        if deny_override:
            return False
        
        # Check for ALLOW override
        allow_override = await self.db.permission_overrides.find_one({
            "client_user_id": client_user["id"],
            "permission_key": permission_key,
            "effect": PermissionEffect.ALLOW
        })
        if allow_override:
            return True
        
        # Fall back to role default
        role_permissions = ROLE_PERMISSIONS.get(client_user.get("role"), [])
        return permission_key in role_permissions
    
    async def get_user_permissions_status(
        self,
        client_user_id: str
    ) -> List[PermissionStatus]:
        """Get full permission status for a user (for UI display)"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            return []
        
        role = client_user.get("role", ClientRole.VIEWER)
        role_perms = set(ROLE_PERMISSIONS.get(role, []))
        
        # Get all overrides
        overrides = await self.get_user_permission_overrides(client_user_id)
        override_map = {o["permission_key"]: o["effect"] for o in overrides}
        
        # Build status for each permission
        catalog = await self.get_permissions_catalog()
        result = []
        
        for perm in catalog:
            key = perm["key"]
            role_default = key in role_perms
            override = override_map.get(key)
            
            # Compute effective value
            if override == PermissionEffect.DENY:
                effective = False
            elif override == PermissionEffect.ALLOW:
                effective = True
            else:
                effective = role_default
            
            result.append(PermissionStatus(
                key=key,
                label=perm["label"],
                group=perm["group"],
                description=perm.get("description"),
                role_default=role_default,
                override=override,
                effective=effective
            ).model_dump())
        
        return result
    
    # =========================================================================
    # SCOPE FILTERING
    # =========================================================================
    
    async def get_user_accessible_locations(
        self,
        client_user_id: str,
        access_level: AccessLevel = AccessLevel.VIEW
    ) -> dict:
        """
        Get all locations accessible to a user.
        Returns dict with sets of IDs for each level.
        Handles inheritance (building scope includes all children).
        """
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            return {
                "client_ids": set(),
                "building_ids": set(),
                "floor_ids": set(),
                "zone_ids": set(),
                "room_ids": set(),
                "room_space_ids": set(),
                "has_full_access": False
            }
        
        # CLIENT_ADMIN has full access
        if client_user.get("role") == ClientRole.CLIENT_ADMIN:
            return {
                "client_ids": {client_user["client_id"]},
                "building_ids": set(),  # Empty means "all"
                "floor_ids": set(),
                "zone_ids": set(),
                "room_ids": set(),
                "room_space_ids": set(),
                "has_full_access": True
            }
        
        # Get user's scopes
        scopes = await self.db.location_scopes.find({
            "client_user_id": client_user_id,
            "access_level": {"$in": [access_level, AccessLevel.MANAGE] if access_level == AccessLevel.VIEW else [AccessLevel.MANAGE]}
        }, {"_id": 0}).to_list(1000)
        
        result = {
            "client_ids": set(),
            "building_ids": set(),
            "floor_ids": set(),
            "zone_ids": set(),
            "room_ids": set(),
            "room_space_ids": set(),
            "has_full_access": False
        }
        
        for scope in scopes:
            scope_type = scope.get("scope_type")
            
            if scope_type == ScopeType.CLIENT:
                result["client_ids"].add(scope.get("client_id"))
                result["has_full_access"] = True
            
            elif scope_type == ScopeType.BUILDING:
                result["building_ids"].add(scope.get("building_id"))
                # Get all children
                await self._add_building_children(scope.get("building_id"), result)
            
            elif scope_type == ScopeType.FLOOR:
                result["floor_ids"].add(scope.get("floor_id"))
                # Get all children
                await self._add_floor_children(scope.get("floor_id"), result)
            
            elif scope_type == ScopeType.ZONE:
                result["zone_ids"].add(scope.get("zone_id"))
            
            elif scope_type == ScopeType.ROOM:
                result["room_ids"].add(scope.get("room_id"))
                # Get all children
                await self._add_room_children(scope.get("room_id"), result)
            
            elif scope_type == ScopeType.ROOM_SPACE:
                result["room_space_ids"].add(scope.get("room_space_id"))
        
        return result
    
    async def _add_building_children(self, building_id: str, result: dict):
        """Add all floors, rooms, spaces under a building"""
        floors = await self.db.floors.find(
            {"building_id": building_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        
        for floor in floors:
            result["floor_ids"].add(floor["id"])
            await self._add_floor_children(floor["id"], result)
    
    async def _add_floor_children(self, floor_id: str, result: dict):
        """Add all rooms, spaces under a floor"""
        rooms = await self.db.rooms.find(
            {"floor_id": floor_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        
        for room in rooms:
            result["room_ids"].add(room["id"])
            await self._add_room_children(room["id"], result)
    
    async def _add_room_children(self, room_id: str, result: dict):
        """Add all spaces under a room"""
        spaces = await self.db.room_spaces.find(
            {"room_id": room_id},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        
        for space in spaces:
            result["room_space_ids"].add(space["id"])
    
    def build_scope_filter(
        self,
        accessible_locations: dict,
        location_field_prefix: str = ""
    ) -> dict:
        """
        Build a MongoDB query filter based on accessible locations.
        
        Args:
            accessible_locations: Result from get_user_accessible_locations()
            location_field_prefix: Prefix for location fields (e.g., "sensor." for nested)
        
        Returns:
            MongoDB query dict
        """
        if accessible_locations.get("has_full_access"):
            return {}  # No filter needed
        
        prefix = location_field_prefix
        or_conditions = []
        
        # Building filter
        building_ids = list(accessible_locations.get("building_ids", set()))
        if building_ids:
            or_conditions.append({f"{prefix}building_id": {"$in": building_ids}})
        
        # Floor filter
        floor_ids = list(accessible_locations.get("floor_ids", set()))
        if floor_ids:
            or_conditions.append({f"{prefix}floor_id": {"$in": floor_ids}})
        
        # Room filter
        room_ids = list(accessible_locations.get("room_ids", set()))
        if room_ids:
            or_conditions.append({f"{prefix}room_id": {"$in": room_ids}})
        
        # Room space filter
        room_space_ids = list(accessible_locations.get("room_space_ids", set()))
        if room_space_ids:
            or_conditions.append({f"{prefix}room_space_id": {"$in": room_space_ids}})
        
        if not or_conditions:
            # No access - return impossible filter
            return {"_impossible": True}
        
        return {"$or": or_conditions}
    
    async def filter_sensors_by_scope(
        self,
        client_user_id: str,
        base_query: dict = None
    ) -> List[dict]:
        """Filter sensors based on user's scope"""
        accessible = await self.get_user_accessible_locations(client_user_id)
        
        if accessible.get("has_full_access"):
            query = base_query or {}
        else:
            scope_filter = self.build_scope_filter(accessible)
            if scope_filter.get("_impossible"):
                return []
            query = {**(base_query or {}), **scope_filter}
        
        return await self.db.sensors.find(query, {"_id": 0}).to_list(10000)
    
    async def filter_events_by_scope(
        self,
        client_user_id: str,
        base_query: dict = None,
        limit: int = 50
    ) -> List[dict]:
        """Filter events based on user's scope (via sensor location)"""
        accessible = await self.get_user_accessible_locations(client_user_id)
        
        if accessible.get("has_full_access"):
            query = base_query or {}
        else:
            # Get accessible sensor IDs first
            sensors = await self.filter_sensors_by_scope(client_user_id)
            sensor_ids = [s["id"] for s in sensors]
            
            if not sensor_ids:
                return []
            
            query = {**(base_query or {}), "sensor_id": {"$in": sensor_ids}}
        
        return await self.db.events.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    # =========================================================================
    # EFFECTIVE ACCESS SUMMARY
    # =========================================================================
    
    async def get_effective_access_summary(
        self,
        client_user_id: str
    ) -> EffectiveAccessSummary:
        """Get a summary of a user's effective access"""
        client_user = await self.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="ClientUser not found")
        
        # Get permissions
        permissions_status = await self.get_user_permissions_status(client_user_id)
        allowed_pages = [p["key"] for p in permissions_status if p["effective"] and p["key"].startswith("PAGE_")]
        allowed_actions = [p["key"] for p in permissions_status if p["effective"] and not p["key"].startswith("PAGE_")]
        denied = [p["key"] for p in permissions_status if not p["effective"]]
        
        # Get accessible locations
        accessible = await self.get_user_accessible_locations(client_user_id)
        
        # Count accessible radars
        sensors = await self.filter_sensors_by_scope(client_user_id)
        
        return EffectiveAccessSummary(
            user_id=client_user["user_id"],
            client_user_id=client_user_id,
            role=client_user.get("role"),
            allowed_pages=allowed_pages,
            allowed_actions=allowed_actions,
            denied_permissions=denied,
            scope_summary={
                "buildings": len(accessible.get("building_ids", set())),
                "floors": len(accessible.get("floor_ids", set())),
                "rooms": len(accessible.get("room_ids", set())),
                "room_spaces": len(accessible.get("room_space_ids", set())),
            },
            accessible_building_ids=list(accessible.get("building_ids", set())),
            accessible_floor_ids=list(accessible.get("floor_ids", set())),
            accessible_room_ids=list(accessible.get("room_ids", set())),
            total_accessible_radars=len(sensors),
            has_full_client_access=accessible.get("has_full_access", False)
        ).model_dump()
    
    # =========================================================================
    # AUDIT LOGGING
    # =========================================================================
    
    async def _log_rbac_action(
        self,
        action: RBACActionType,
        target_user_id: str,
        target_client_user_id: str,
        performed_by_user_id: str,
        client_id: str,
        details: dict,
        ip_address: Optional[str] = None
    ):
        """Log an RBAC action for audit"""
        log = RBACAuditLog(
            action=action,
            target_user_id=target_user_id,
            target_client_user_id=target_client_user_id,
            performed_by_user_id=performed_by_user_id,
            client_id=client_id,
            details=details,
            ip_address=ip_address
        )
        await self.db.rbac_audit_logs.insert_one(log.model_dump())
    
    async def get_audit_logs(
        self,
        client_id: Optional[str] = None,
        target_user_id: Optional[str] = None,
        limit: int = 100
    ) -> List[dict]:
        """Get RBAC audit logs"""
        query = {}
        if client_id:
            query["client_id"] = client_id
        if target_user_id:
            query["target_user_id"] = target_user_id
        
        return await self.db.rbac_audit_logs.find(
            query,
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)


# =============================================================================
# DEPENDENCY INJECTION HELPERS
# =============================================================================

# Global instance (will be initialized with DB)
_rbac_service: Optional[RBACService] = None


def init_rbac_service(db: AsyncIOMotorDatabase):
    """Initialize the RBAC service with database"""
    global _rbac_service
    _rbac_service = RBACService(db)
    return _rbac_service


def get_rbac_service() -> RBACService:
    """Get the RBAC service instance"""
    if _rbac_service is None:
        raise RuntimeError("RBAC service not initialized")
    return _rbac_service
