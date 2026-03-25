"""
Session Service for OhmGuard
Manages server-side user sessions with Redis caching and MongoDB persistence.
Supports session creation, validation, revocation, and cleanup.
"""

import json
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from config.redis import get_redis_client

logger = logging.getLogger(__name__)

# Redis key prefix
SESSION_PREFIX = "session"
# Session TTL matches refresh token expiry
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days


# ==================== Models ====================

class SessionCreate(BaseModel):
    user_id: str
    tenant_id: Optional[str] = None
    device_info: dict = {}


class SessionDoc(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tenant_id: Optional[str] = None
    refresh_token_jti: str
    device_info: dict = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = None
    is_active: bool = True
    revoked_at: Optional[datetime] = None


class SessionResponse(BaseModel):
    id: str
    device_info: dict = {}
    created_at: str
    last_activity: str
    expires_at: str
    is_current: bool = False


# ==================== Service ====================

class SessionService:
    """Manages user sessions with Redis cache + MongoDB persistence."""

    def __init__(self):
        self._db: Optional[AsyncIOMotorDatabase] = None

    def set_db(self, db: AsyncIOMotorDatabase):
        self._db = db

    @property
    def collection(self):
        return self._db.sessions

    def _redis_key(self, jti: str) -> str:
        return f"{SESSION_PREFIX}:{jti}"

    # ==================== Create ====================

    async def create_session(
        self,
        user_id: str,
        tenant_id: Optional[str],
        device_info: dict
    ) -> tuple:
        """
        Create a new session.
        Returns (session_id, jti) for embedding in JWT tokens.
        """
        jti = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=SESSION_TTL_SECONDS)

        session = SessionDoc(
            user_id=user_id,
            tenant_id=tenant_id,
            refresh_token_jti=jti,
            device_info=device_info,
            created_at=now,
            last_activity=now,
            expires_at=expires_at,
        )

        doc = session.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['last_activity'] = doc['last_activity'].isoformat()
        doc['expires_at'] = doc['expires_at'].isoformat()
        await self.collection.insert_one(doc)

        # Cache in Redis
        self._cache_session(jti, {
            "session_id": session.id,
            "user_id": user_id,
            "active": True,
        })

        logger.info(f"Session created: {session.id} for user {user_id}")
        return session.id, jti

    # ==================== Validate ====================

    async def validate_session(self, jti: str) -> Optional[dict]:
        """
        Validate a session by JTI.
        Checks Redis first, falls back to MongoDB.
        Returns session dict or None if invalid/revoked.
        """
        if not jti:
            return None

        # Try Redis first
        redis = get_redis_client()
        if redis:
            try:
                data = redis.get(self._redis_key(jti))
                if data:
                    parsed = json.loads(data)
                    if parsed.get("active"):
                        return parsed
                    return None
                # Key absent in Redis = possibly revoked or expired
                # Fall through to MongoDB check
            except Exception as e:
                logger.warning(f"Redis session check failed: {e}")

        # Fallback to MongoDB
        session = await self.collection.find_one(
            {"refresh_token_jti": jti, "is_active": True},
            {"_id": 0}
        )
        if not session:
            return None

        # Check expiration
        expires_at = session.get('expires_at')
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at and expires_at < datetime.now(timezone.utc):
            return None

        result = {
            "session_id": session['id'],
            "user_id": session['user_id'],
            "active": True,
        }

        # Re-cache in Redis
        self._cache_session(jti, result)

        return result

    # ==================== Revoke ====================

    async def revoke_session(self, session_id: str, user_id: str) -> bool:
        """
        Revoke a specific session.
        Returns True if the session was found and revoked.
        """
        now = datetime.now(timezone.utc)

        session = await self.collection.find_one(
            {"id": session_id, "user_id": user_id, "is_active": True},
            {"_id": 0}
        )
        if not session:
            return False

        jti = session.get('refresh_token_jti')

        await self.collection.update_one(
            {"id": session_id},
            {"$set": {"is_active": False, "revoked_at": now.isoformat()}}
        )

        # Remove from Redis
        self._delete_cache(jti)

        # Force disconnect Socket.IO
        await self._disconnect_socket(jti)

        logger.info(f"Session revoked: {session_id} for user {user_id}")
        return True

    async def revoke_all_sessions(self, user_id: str, except_jti: Optional[str] = None) -> int:
        """
        Revoke all active sessions for a user.
        Optionally keep the current session (identified by except_jti).
        Returns the number of sessions revoked.
        """
        now = datetime.now(timezone.utc)

        query = {"user_id": user_id, "is_active": True}
        if except_jti:
            query["refresh_token_jti"] = {"$ne": except_jti}

        sessions = await self.collection.find(query, {"_id": 0, "id": 1, "refresh_token_jti": 1}).to_list(100)

        if not sessions:
            return 0

        session_ids = [s['id'] for s in sessions]
        jtis = [s['refresh_token_jti'] for s in sessions]

        await self.collection.update_many(
            {"id": {"$in": session_ids}},
            {"$set": {"is_active": False, "revoked_at": now.isoformat()}}
        )

        # Remove from Redis and disconnect sockets
        for jti in jtis:
            self._delete_cache(jti)
            await self._disconnect_socket(jti)

        logger.info(f"Revoked {len(sessions)} sessions for user {user_id}")
        return len(sessions)

    # ==================== List ====================

    async def list_user_sessions(self, user_id: str) -> List[dict]:
        """List all active sessions for a user."""
        now = datetime.now(timezone.utc)

        sessions = await self.collection.find(
            {
                "user_id": user_id,
                "is_active": True,
            },
            {"_id": 0, "id": 1, "device_info": 1, "created_at": 1,
             "last_activity": 1, "expires_at": 1, "refresh_token_jti": 1}
        ).sort("last_activity", -1).to_list(50)

        # Filter out expired
        result = []
        for s in sessions:
            expires_at = s.get('expires_at')
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at < now:
                continue
            result.append({
                "id": s['id'],
                "device_info": s.get('device_info', {}),
                "created_at": s.get('created_at', ''),
                "last_activity": s.get('last_activity', ''),
                "expires_at": s.get('expires_at', ''),
                "refresh_token_jti": s.get('refresh_token_jti', ''),
            })

        return result

    # ==================== Update Activity ====================

    async def update_last_activity(self, jti: str):
        """Update last_activity timestamp for a session."""
        now = datetime.now(timezone.utc)
        await self.collection.update_one(
            {"refresh_token_jti": jti, "is_active": True},
            {"$set": {"last_activity": now.isoformat()}}
        )

    # ==================== Rotate JTI ====================

    async def rotate_jti(self, old_jti: str, new_jti: str) -> Optional[str]:
        """
        Rotate the JTI on token refresh.
        Returns the session_id if successful, None if session invalid.
        """
        session = await self.collection.find_one(
            {"refresh_token_jti": old_jti, "is_active": True},
            {"_id": 0}
        )
        if not session:
            return None

        now = datetime.now(timezone.utc)
        new_expires = now + timedelta(seconds=SESSION_TTL_SECONDS)

        await self.collection.update_one(
            {"id": session['id']},
            {"$set": {
                "refresh_token_jti": new_jti,
                "last_activity": now.isoformat(),
                "expires_at": new_expires.isoformat(),
            }}
        )

        # Remove old Redis key, set new one
        self._delete_cache(old_jti)
        self._cache_session(new_jti, {
            "session_id": session['id'],
            "user_id": session['user_id'],
            "active": True,
        })

        return session['id']

    # ==================== Cleanup ====================

    async def cleanup_expired_sessions(self) -> int:
        """Remove expired and old revoked sessions."""
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)

        result = await self.collection.delete_many({
            "$or": [
                {"is_active": True, "expires_at": {"$lt": now.isoformat()}},
                {"is_active": False, "revoked_at": {"$lt": thirty_days_ago.isoformat()}},
            ]
        })

        if result.deleted_count > 0:
            logger.info(f"Cleaned up {result.deleted_count} expired/revoked sessions")
        return result.deleted_count

    # ==================== Redis Helpers ====================

    def _cache_session(self, jti: str, data: dict):
        """Cache session data in Redis with TTL."""
        redis = get_redis_client()
        if not redis:
            return
        try:
            redis.setex(
                self._redis_key(jti),
                SESSION_TTL_SECONDS,
                json.dumps(data)
            )
        except Exception as e:
            logger.warning(f"Failed to cache session in Redis: {e}")

    def _delete_cache(self, jti: str):
        """Delete session cache from Redis."""
        if not jti:
            return
        redis = get_redis_client()
        if not redis:
            return
        try:
            redis.delete(self._redis_key(jti))
        except Exception as e:
            logger.warning(f"Failed to delete session cache: {e}")

    # ==================== Socket.IO Disconnect ====================

    async def _disconnect_socket(self, jti: str):
        """Force disconnect a WebSocket client by JTI."""
        if not jti:
            return
        try:
            from socketio_service import disconnect_by_jti
            await disconnect_by_jti(jti)
        except Exception as e:
            logger.warning(f"Failed to disconnect socket for jti: {e}")


# ==================== Module-level init ====================

_session_service: Optional[SessionService] = None


def init_session_service(db: AsyncIOMotorDatabase):
    """Initialize the session service with database reference."""
    global _session_service
    _session_service = SessionService()
    _session_service.set_db(db)
    return _session_service


def get_session_service() -> SessionService:
    """Get the session service instance."""
    return _session_service
