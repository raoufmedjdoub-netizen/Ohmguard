# ============================================================
# PUSH NOTIFICATION SERVICE FOR OHMGUARD
# Service de notifications push via Expo Push API
# ============================================================

import httpx
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Expo Push API URL
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push_notification(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None
) -> Optional[Dict]:
    """
    Envoie une notification push via l'API Expo Push

    Args:
        tokens: Liste des tokens Expo Push (ExponentPushToken[xxx])
        title: Titre de la notification
        body: Corps de la notification
        data: Données supplémentaires envoyées avec la notification

    Returns:
        Résultat de l'API Expo ou None en cas d'erreur
    """
    if not tokens:
        logger.info("[Push] Aucun token fourni")
        return None

    messages = []
    for token in tokens:
        if not token or not token.startswith('ExponentPushToken'):
            continue
        message = {
            "to": token,
            "sound": "alert.wav",
            "title": title,
            "body": body,
            "priority": "high",
            "channelId": "fall-alerts",
        }
        if data:
            message["data"] = data
        messages.append(message)

    if not messages:
        logger.info("[Push] Aucun token Expo valide trouvé")
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            result = response.json()
            logger.info(f"[Push] Notification envoyée: {result}")
            return result
    except httpx.TimeoutException:
        logger.error("[Push] Timeout lors de l'envoi de la notification")
        return None
    except Exception as e:
        logger.error(f"[Push] Erreur d'envoi: {e}")
        return None


class PushNotificationService:
    """Service de gestion des notifications push"""

    def __init__(self, db):
        self.db = db
        logger.info("[Push] Service de notifications push initialisé")

    async def register_token(
        self,
        user_id: str,
        tenant_id: str,
        token: str,
        device_type: Optional[str] = None
    ) -> Dict[str, str]:
        """Enregistre ou met à jour un token push pour un utilisateur."""
        import uuid

        existing = await self.db.push_tokens.find_one({
            "user_id": user_id,
            "token": token
        })

        if existing:
            await self.db.push_tokens.update_one(
                {"_id": existing["_id"]},
                {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            logger.info(f"[Push] Token mis à jour pour l'utilisateur {user_id}")
            return {
                "message": "Token mis à jour",
                "token_id": existing.get("id"),
                "notifications_enabled": existing.get("notifications_enabled", True)
            }

        push_token = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "tenant_id": tenant_id,
            "token": token,
            "device_type": device_type,
            "notifications_enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        await self.db.push_tokens.insert_one(push_token)
        logger.info(f"[Push] Nouveau token enregistré pour l'utilisateur {user_id}: {token[:30]}...")

        return {
            "message": "Token enregistré",
            "token_id": push_token["id"],
            "notifications_enabled": True
        }

    async def set_notifications_enabled(
        self,
        user_id: str,
        token: str,
        enabled: bool
    ) -> Dict[str, Any]:
        """
        Active ou désactive les notifications push pour un token.

        Args:
            user_id: ID de l'utilisateur
            token: Token Expo Push
            enabled: True pour activer, False pour désactiver

        Returns:
            Statut mis à jour
        """
        result = await self.db.push_tokens.update_one(
            {"user_id": user_id, "token": token},
            {"$set": {
                "notifications_enabled": enabled,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        if result.matched_count == 0:
            return {"success": False, "error": "Token non trouvé"}

        status = "activées" if enabled else "désactivées"
        logger.info(f"[Push] Notifications {status} pour l'utilisateur {user_id}")
        return {"success": True, "notifications_enabled": enabled}

    async def get_notifications_status(self, user_id: str, token: str) -> Dict[str, Any]:
        """
        Retourne le statut des notifications pour un token utilisateur.

        Args:
            user_id: ID de l'utilisateur
            token: Token Expo Push

        Returns:
            Statut actuel des notifications
        """
        doc = await self.db.push_tokens.find_one(
            {"user_id": user_id, "token": token},
            {"notifications_enabled": 1, "_id": 0}
        )
        if not doc:
            return {"registered": False, "notifications_enabled": False}
        return {
            "registered": True,
            "notifications_enabled": doc.get("notifications_enabled", True)
        }

    async def delete_token(self, user_id: str, token: str) -> bool:
        """Supprime un token push."""
        result = await self.db.push_tokens.delete_one({
            "user_id": user_id,
            "token": token
        })

        if result.deleted_count > 0:
            logger.info(f"[Push] Token supprimé pour l'utilisateur {user_id}")
            return True
        return False

    async def get_tenant_tokens(self, tenant_id: str) -> List[str]:
        """Récupère les tokens push actifs d'un tenant (notifications_enabled != false)."""
        cursor = self.db.push_tokens.find(
            {"tenant_id": tenant_id, "notifications_enabled": {"$ne": False}},
            {"token": 1, "_id": 0}
        )
        tokens = await cursor.to_list(length=100)
        return [t["token"] for t in tokens if t.get("token")]

    async def send_to_tenant(
        self,
        tenant_id: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict]:
        """Envoie une notification à tous les appareils actifs d'un tenant."""
        tokens = await self.get_tenant_tokens(tenant_id)

        if not tokens:
            logger.info(f"[Push] Aucun appareil actif pour le tenant {tenant_id}")
            return None

        result = await send_expo_push_notification(tokens, title, body, data)
        logger.info(f"[Push] Notification envoyée à {len(tokens)} appareil(s) pour le tenant {tenant_id}")

        return result

    async def send_fall_alert(
        self,
        tenant_id: str,
        event_id: str,
        location: str = "Localisation inconnue",
        severity: str = "HIGH",
        sensor_id: str = None
    ) -> Optional[Dict]:
        """Envoie une alerte de chute aux utilisateurs scopés."""
        tokens = await self.get_scoped_tokens(tenant_id, sensor_id)

        if not tokens:
            logger.info(f"[Push] Aucun appareil éligible pour l'alerte (tenant={tenant_id}, sensor={sensor_id})")
            return None

        title = "🚨 ALERTE CHUTE DÉTECTÉE"
        body = f"Chute détectée - {location}"
        data = {
            "type": "new_event",
            "event_id": event_id,
            "eventType": "FALL",
            "location": location,
            "severity": severity
        }

        result = await send_expo_push_notification(tokens, title, body, data)
        logger.info(f"[Push] Alerte envoyée à {len(tokens)} appareil(s) (tenant={tenant_id}, sensor={sensor_id})")
        return result

    async def get_scoped_tokens(self, tenant_id: str, sensor_id: str = None) -> List[str]:
        """
        Get push tokens for users who have access to the given sensor's location.
        Falls back to all tenant tokens if sensor has no location or RBAC unavailable.
        """
        # Get all active push tokens for this tenant
        all_tokens_docs = await self.db.push_tokens.find(
            {"tenant_id": tenant_id, "notifications_enabled": {"$ne": False}},
            {"_id": 0, "token": 1, "user_id": 1}
        ).to_list(200)

        if not all_tokens_docs or not sensor_id:
            return [t["token"] for t in all_tokens_docs if t.get("token")]

        # Get sensor location info
        sensor = await self.db.sensors.find_one(
            {"id": sensor_id},
            {"_id": 0, "client_id": 1, "building_id": 1, "floor_id": 1, "room_id": 1}
        )

        if not sensor or not sensor.get("building_id"):
            # No location info - send to all tenant users
            return [t["token"] for t in all_tokens_docs if t.get("token")]

        sensor_building_id = sensor.get("building_id")
        sensor_floor_id = sensor.get("floor_id")
        sensor_room_id = sensor.get("room_id")
        client_id = sensor.get("client_id", tenant_id)

        eligible_tokens = []

        for token_doc in all_tokens_docs:
            user_id = token_doc.get("user_id")
            token = token_doc.get("token")
            if not user_id or not token:
                continue

            # Check user's role - admins always get notified
            user = await self.db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
            if not user:
                continue

            if user.get("role") in ("SUPER_ADMIN", "TENANT_ADMIN"):
                eligible_tokens.append(token)
                continue

            # Check client_user and scopes
            client_user = await self.db.client_users.find_one(
                {"user_id": user_id, "client_id": client_id, "is_active": True},
                {"_id": 0, "id": 1, "role": 1}
            )

            if not client_user:
                # No client_user - legacy user, include them
                eligible_tokens.append(token)
                continue

            if client_user.get("role") == "CLIENT_ADMIN":
                eligible_tokens.append(token)
                continue

            # Check location_scopes
            scopes = await self.db.location_scopes.find(
                {"client_user_id": client_user["id"]},
                {"_id": 0, "scope_type": 1, "building_id": 1, "floor_id": 1, "room_id": 1, "client_id": 1}
            ).to_list(100)

            if not scopes:
                # No scopes defined — only CLIENT_ADMIN gets implicit full access (handled above).
                # Regular roles (SUPERVISOR, OPERATOR, VIEWER) with no scopes = no notifications.
                continue

            # Check if any scope matches the sensor's location
            for scope in scopes:
                st = scope.get("scope_type")
                if st == "CLIENT":
                    eligible_tokens.append(token)
                    break
                elif st == "BUILDING" and scope.get("building_id") == sensor_building_id:
                    eligible_tokens.append(token)
                    break
                elif st == "FLOOR" and scope.get("floor_id") == sensor_floor_id:
                    eligible_tokens.append(token)
                    break
                elif st == "ROOM" and scope.get("room_id") == sensor_room_id:
                    eligible_tokens.append(token)
                    break

        return eligible_tokens

    async def send_test_notification(self, user_id: str) -> Optional[Dict]:
        """Envoie une notification de test à un utilisateur."""
        cursor = self.db.push_tokens.find(
            {"user_id": user_id, "notifications_enabled": {"$ne": False}},
            {"token": 1, "_id": 0}
        )
        tokens_docs = await cursor.to_list(length=10)
        tokens = [t["token"] for t in tokens_docs if t.get("token")]

        if not tokens:
            logger.info(f"[Push] Aucun token actif pour l'utilisateur {user_id}")
            return None

        return await send_expo_push_notification(
            tokens=tokens,
            title="🔔 Test de Notification",
            body="Les notifications push fonctionnent correctement !",
            data={
                "type": "test",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )


# Instance globale du service (initialisée au démarrage)
_push_service: Optional[PushNotificationService] = None


def init_push_notification_service(db) -> PushNotificationService:
    """Initialise le service de notifications push"""
    global _push_service
    _push_service = PushNotificationService(db)
    return _push_service


def get_push_notification_service() -> Optional[PushNotificationService]:
    """Retourne l'instance du service de notifications push"""
    return _push_service
