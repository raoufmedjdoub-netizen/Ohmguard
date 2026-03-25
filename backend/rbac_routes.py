"""
RBAC Routes - API endpoints for user management and permissions
===============================================================

Endpoints:
- GET/POST /api/clients/:clientId/users - List/Create client users
- PATCH /api/client-users/:clientUserId - Update client user
- GET/PUT /api/client-users/:clientUserId/permissions - Manage permissions
- GET/PUT /api/client-users/:clientUserId/scopes - Manage scopes
- GET /api/client-users/:clientUserId/effective-access - Get effective access
- GET /api/permissions/catalog - Get permissions catalog
- GET /api/roles/permissions - Get default role permissions
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Body, Query

logger = logging.getLogger(__name__)
from typing import List, Optional
from pydantic import BaseModel, EmailStr

from rbac_models import (
    ClientRole, PermissionEffect, ScopeType, AccessLevel,
    ClientUserCreate, UserPermissionOverrideCreate, LocationScopeCreate,
    ROLE_PERMISSIONS
)
from rbac_service import get_rbac_service, RBACService

# Create router
rbac_router = APIRouter(tags=["RBAC"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateClientUserRequest(BaseModel):
    """Request to create a new client user"""
    email: EmailStr
    full_name: str
    password: Optional[str] = None
    role: ClientRole = ClientRole.VIEWER
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


class UpdateClientUserRequest(BaseModel):
    """Request to update a client user"""
    role: Optional[ClientRole] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    notes: Optional[str] = None


class PermissionOverrideRequest(BaseModel):
    """Single permission override"""
    permission_key: str
    effect: PermissionEffect


class BulkPermissionOverridesRequest(BaseModel):
    """Bulk permission overrides update"""
    overrides: List[PermissionOverrideRequest]


class ScopeRequest(BaseModel):
    """Single scope request"""
    scope_type: ScopeType
    client_id: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    zone_id: Optional[str] = None
    room_id: Optional[str] = None
    room_space_id: Optional[str] = None
    access_level: AccessLevel = AccessLevel.VIEW


class BulkScopesRequest(BaseModel):
    """Bulk scopes update"""
    scopes: List[ScopeRequest]


class ResetPasswordRequest(BaseModel):
    """Request to reset a user's password"""
    new_password: str


# =============================================================================
# ROUTES
# =============================================================================

def create_rbac_routes(get_current_user, check_permission, db):
    """
    Create RBAC routes with injected dependencies.
    
    Args:
        get_current_user: Dependency to get current user
        check_permission: Function to check permissions
        db: Database instance
    """
    
    router = APIRouter(prefix="/api", tags=["RBAC"])
    
    # -------------------------------------------------------------------------
    # PERMISSIONS CATALOG
    # -------------------------------------------------------------------------
    
    @router.get("/permissions/catalog")
    async def get_permissions_catalog(
        current_user = Depends(get_current_user)
    ):
        """Get all available permissions"""
        rbac = get_rbac_service()
        return await rbac.get_permissions_catalog()
    
    @router.get("/roles/permissions")
    async def get_role_permissions(
        current_user = Depends(get_current_user)
    ):
        """Get default permissions for each role"""
        return {
            role.value: perms 
            for role, perms in ROLE_PERMISSIONS.items()
        }
    
    # -------------------------------------------------------------------------
    # CLIENT USERS
    # -------------------------------------------------------------------------
    
    @router.get("/clients/{client_id}/users")
    async def list_client_users(
        client_id: str,
        current_user = Depends(get_current_user)
    ):
        """List all users for a client"""
        rbac = get_rbac_service()
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_id, "PAGE_USERS_VIEW"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.list_client_users(client_id)
    
    @router.post("/clients/{client_id}/users")
    async def create_client_user(
        client_id: str,
        request: CreateClientUserRequest,
        current_user = Depends(get_current_user)
    ):
        """Create a new user and add them to the client"""
        rbac = get_rbac_service()
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_id, "USER_CREATE"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Check if user with email already exists
        existing_user = await db.users.find_one({"email": request.email})

        if existing_user:
            # Add existing user to client
            user_id = existing_user["id"]
            temp_password = None
        else:
            # Create new user with temporary password
            import uuid
            import secrets
            from datetime import datetime, timezone
            import bcrypt

            # Generate temporary password or use provided one
            if request.password:
                temp_password = request.password
                must_change = False
            else:
                temp_password = secrets.token_urlsafe(10)  # ~13 chars, URL-safe
                must_change = True

            user_id = str(uuid.uuid4())
            hashed_pw = bcrypt.hashpw(temp_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            new_user = {
                "id": user_id,
                "email": request.email,
                "full_name": request.full_name,
                "hashed_password": hashed_pw,
                "role": "VIEWER",
                "tenant_id": client_id,
                "language": "fr",
                "is_active": True,
                "must_change_password": must_change,
                "phone": request.phone,
                "job_title": request.job_title,
                "department": request.department,
                "notes": request.notes,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(new_user)

        # Create ClientUser
        client_user = await rbac.create_client_user(
            client_id=client_id,
            user_id=user_id,
            role=request.role,
            created_by=current_user.id
        )

        # Send welcome email with temporary password
        if temp_password and not request.password:
            try:
                from email_service import get_email_service
                email_svc = get_email_service()
                if email_svc:
                    # Get client name for the email
                    client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1})
                    org_name = client_doc.get("name", "") if client_doc else ""
                    await email_svc.send_welcome_email(
                        to_email=request.email,
                        full_name=request.full_name,
                        temp_password=temp_password,
                        org_name=org_name
                    )
            except Exception as e:
                logger.warning(f"Failed to send welcome email to {request.email}: {e}")

        # Add user details
        client_user["user_email"] = request.email
        client_user["user_full_name"] = request.full_name

        return client_user
    
    @router.get("/client-users/{client_user_id}")
    async def get_client_user(
        client_user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get a client user by ID"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "PAGE_USERS_VIEW"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Enrich with user details
        user = await db.users.find_one(
            {"id": client_user["user_id"]},
            {"_id": 0, "email": 1, "full_name": 1}
        )
        if user:
            client_user["user_email"] = user.get("email")
            client_user["user_full_name"] = user.get("full_name")
        
        return client_user
    
    @router.patch("/client-users/{client_user_id}")
    async def update_client_user(
        client_user_id: str,
        request: UpdateClientUserRequest,
        current_user = Depends(get_current_user)
    ):
        """Update a client user's role or status"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Update role if provided
        if request.role is not None:
            await rbac.update_client_user_role(
                client_user_id, request.role, current_user.id
            )
        
        # Update is_active if provided
        if request.is_active is not None:
            from datetime import datetime, timezone
            await db.client_users.update_one(
                {"id": client_user_id},
                {"$set": {
                    "is_active": request.is_active,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # Log action
            from rbac_models import RBACActionType, RBACAuditLog
            action = RBACActionType.USER_ACTIVATE if request.is_active else RBACActionType.USER_DEACTIVATE
            log = RBACAuditLog(
                action=action,
                target_user_id=client_user["user_id"],
                target_client_user_id=client_user_id,
                performed_by_user_id=current_user.id,
                client_id=client_user["client_id"],
                details={"is_active": request.is_active}
            )
            await db.rbac_audit_logs.insert_one(log.model_dump())
        
        # Update contact fields on the user document
        contact_updates = {}
        for field in ["full_name", "phone", "job_title", "department", "notes"]:
            val = getattr(request, field, None)
            if val is not None:
                contact_updates[field] = val
        if contact_updates:
            await db.users.update_one(
                {"id": client_user["user_id"]},
                {"$set": contact_updates}
            )
        
        return await rbac.get_client_user_by_id(client_user_id)
    
    @router.delete("/client-users/{client_user_id}")
    async def delete_client_user(
        client_user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Retirer un utilisateur d'un client (ne supprime pas le compte utilisateur)"""
        rbac = get_rbac_service()

        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Utilisateur client non trouvé")

        # Vérifier les permissions
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_DELETE"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission refusée")

        # Stocker les détails pour le journal d'audit avant suppression
        deleted_user_id = client_user.get("user_id")
        deleted_client_id = client_user.get("client_id")
        deleted_role = client_user.get("role")

        # Supprimer les données associées
        await db.permission_overrides.delete_many({"client_user_id": client_user_id})
        await db.location_scopes.delete_many({"client_user_id": client_user_id})
        await db.client_users.delete_one({"id": client_user_id})

        # Créer le journal d'audit pour la suppression
        from rbac_models import RBACAuditLog, RBACActionType
        log = RBACAuditLog(
            action=RBACActionType.USER_REMOVE,
            target_user_id=deleted_user_id,
            target_client_user_id=client_user_id,
            performed_by_user_id=current_user.id,
            client_id=deleted_client_id,
            details={
                "removed_role": deleted_role,
                "action": "utilisateur_retire_du_client"
            }
        )
        await db.rbac_audit_logs.insert_one(log.model_dump())

        return {"status": "success", "message": "Utilisateur retiré du client"}
    
    @router.post("/client-users/{client_user_id}/reset-password")
    async def reset_user_password(
        client_user_id: str,
        request: ResetPasswordRequest,
        current_user = Depends(get_current_user)
    ):
        """Reset a user's password (admin only)"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission - require USER_EDIT permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Hash the new password
        import bcrypt
        hashed_pw = bcrypt.hashpw(request.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Update the user's password
        result = await db.users.update_one(
            {"id": client_user["user_id"]},
            {"$set": {"hashed_password": hashed_pw}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="User not found in database")
        
        # Log the action
        from datetime import datetime, timezone
        from rbac_models import RBACAuditLog, RBACActionType
        log = RBACAuditLog(
            action=RBACActionType.ROLE_CHANGE,  # We could add a PASSWORD_RESET action type
            target_user_id=client_user["user_id"],
            target_client_user_id=client_user_id,
            performed_by_user_id=current_user.id,
            client_id=client_user["client_id"],
            details={"action": "password_reset"}
        )
        await db.rbac_audit_logs.insert_one(log.model_dump())
        
        return {"status": "success", "message": "Password reset successfully"}
    
    # -------------------------------------------------------------------------
    # PERMISSIONS
    # -------------------------------------------------------------------------
    
    @router.get("/client-users/{client_user_id}/permissions")
    async def get_user_permissions(
        client_user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get all permissions with status for a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "PAGE_USERS_VIEW"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.get_user_permissions_status(client_user_id)
    
    @router.put("/client-users/{client_user_id}/permissions")
    async def update_user_permissions(
        client_user_id: str,
        request: BulkPermissionOverridesRequest,
        current_user = Depends(get_current_user)
    ):
        """Update all permission overrides for a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_PERMISSIONS_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Convert request to dict format
        overrides = [
            {"permission_key": o.permission_key, "effect": o.effect}
            for o in request.overrides
        ]
        
        await rbac.bulk_update_permission_overrides(
            client_user_id, overrides, current_user.id
        )
        
        return await rbac.get_user_permissions_status(client_user_id)
    
    # -------------------------------------------------------------------------
    # SCOPES
    # -------------------------------------------------------------------------
    
    @router.get("/client-users/{client_user_id}/scopes")
    async def get_user_scopes(
        client_user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get all location scopes for a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "PAGE_USERS_VIEW"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.get_user_scopes(client_user_id)
    
    @router.put("/client-users/{client_user_id}/scopes")
    async def update_user_scopes(
        client_user_id: str,
        request: BulkScopesRequest,
        current_user = Depends(get_current_user)
    ):
        """Update all location scopes for a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_SCOPES_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        # Convert request to dict format
        scopes = [s.model_dump() for s in request.scopes]
        
        await rbac.bulk_update_scopes(client_user_id, scopes, current_user.id)
        
        return await rbac.get_user_scopes(client_user_id)
    
    @router.post("/client-users/{client_user_id}/scopes")
    async def add_user_scope(
        client_user_id: str,
        request: ScopeRequest,
        current_user = Depends(get_current_user)
    ):
        """Add a single scope to a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_SCOPES_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.add_scope(client_user_id, request.model_dump(), current_user.id)
    
    @router.delete("/scopes/{scope_id}")
    async def delete_scope(
        scope_id: str,
        current_user = Depends(get_current_user)
    ):
        """Delete a scope"""
        rbac = get_rbac_service()
        
        scope = await db.location_scopes.find_one({"id": scope_id})
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")
        
        client_user = await rbac.get_client_user_by_id(scope["client_user_id"])
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_user["client_id"], "USER_SCOPES_EDIT"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        await rbac.remove_scope(scope_id, current_user.id)
        
        return {"status": "success", "message": "Scope deleted"}
    
    # -------------------------------------------------------------------------
    # EFFECTIVE ACCESS
    # -------------------------------------------------------------------------
    
    @router.get("/client-users/{client_user_id}/effective-access")
    async def get_effective_access(
        client_user_id: str,
        current_user = Depends(get_current_user)
    ):
        """Get summary of effective access for a user"""
        rbac = get_rbac_service()
        
        client_user = await rbac.get_client_user_by_id(client_user_id)
        if not client_user:
            raise HTTPException(status_code=404, detail="Client user not found")
        
        # Check permission (user can see their own access)
        if client_user["user_id"] != current_user.id:
            has_perm = await rbac.has_permission(
                current_user.id, client_user["client_id"], "PAGE_USERS_VIEW"
            )
            if not has_perm and current_user.role != "SUPER_ADMIN":
                raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.get_effective_access_summary(client_user_id)
    
    @router.get("/my-access")
    async def get_my_access(
        client_id: Optional[str] = Query(None),
        current_user = Depends(get_current_user)
    ):
        """Get current user's effective access (for frontend)"""
        rbac = get_rbac_service()
        
        # Use provided client_id or user's default tenant
        target_client_id = client_id or current_user.tenant_id
        if not target_client_id:
            raise HTTPException(status_code=400, detail="No client specified")
        
        # Get or create ClientUser
        client_user = await rbac.get_client_user(target_client_id, current_user.id)
        
        if not client_user:
            # Super admin without ClientUser - return full access
            if current_user.role == "SUPER_ADMIN":
                return {
                    "role": "SUPER_ADMIN",
                    "permissions": [p["key"] for p in await rbac.get_permissions_catalog()],
                    "has_full_access": True,
                    "scopes": []
                }
            raise HTTPException(status_code=403, detail="User not associated with this client")
        
        # Get effective access
        summary = await rbac.get_effective_access_summary(client_user["id"])
        
        # Format for frontend
        return {
            "role": summary["role"],
            "permissions": summary["allowed_pages"] + summary["allowed_actions"],
            "has_full_access": summary["has_full_client_access"],
            "scopes": await rbac.get_user_scopes(client_user["id"]),
            "accessible_building_ids": summary["accessible_building_ids"],
            "accessible_floor_ids": summary["accessible_floor_ids"],
            "accessible_room_ids": summary["accessible_room_ids"]
        }
    
    # -------------------------------------------------------------------------
    # AUDIT LOGS
    # -------------------------------------------------------------------------
    
    @router.get("/clients/{client_id}/audit-logs")
    async def get_audit_logs(
        client_id: str,
        limit: int = Query(100, le=500),
        current_user = Depends(get_current_user)
    ):
        """Get RBAC audit logs for a client"""
        rbac = get_rbac_service()
        
        # Check permission
        has_perm = await rbac.has_permission(
            current_user.id, client_id, "AUDIT_LOG_VIEW"
        )
        if not has_perm and current_user.role != "SUPER_ADMIN":
            raise HTTPException(status_code=403, detail="Permission denied")
        
        return await rbac.get_audit_logs(client_id=client_id, limit=limit)
    
    return router
