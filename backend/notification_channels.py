"""
Notification Channel Providers for OhmGuard
Sends messages via SMS (Twilio), WhatsApp (Twilio), and Telegram (Bot API).
"""
import logging
import base64
import httpx
from typing import Optional, Dict
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class NotificationChannelProvider(ABC):
    """Abstract base class for notification channel providers."""

    @abstractmethod
    async def send_message(self, to: str, message: str, subject: str = None) -> Dict:
        """Send a message. Returns {"success": bool, "error": str|None}."""
        pass


class SmsProvider(NotificationChannelProvider):
    """Send SMS via Twilio REST API."""

    def __init__(self, config: Dict):
        self.account_sid = config.get("account_sid", "")
        self.auth_token = config.get("auth_token", "")
        self.from_number = config.get("from_number", "")

    async def send_message(self, to: str, message: str, subject: str = None) -> Dict:
        if not self.account_sid or not self.auth_token or not self.from_number:
            return {"success": False, "error": "Twilio SMS non configuré"}

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth_str = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    data={"From": self.from_number, "To": to, "Body": message},
                    headers={"Authorization": f"Basic {auth_str}"},
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    return {"success": True, "sid": data.get("sid")}
                else:
                    error = resp.json().get("message", resp.text)
                    logger.error(f"Twilio SMS error: {resp.status_code} - {error}")
                    return {"success": False, "error": f"Twilio: {error}"}
        except Exception as e:
            logger.error(f"SMS send failed: {e}")
            return {"success": False, "error": str(e)}


class WhatsAppProvider(NotificationChannelProvider):
    """Send WhatsApp messages via Twilio WhatsApp API."""

    def __init__(self, config: Dict):
        self.account_sid = config.get("account_sid", "")
        self.auth_token = config.get("auth_token", "")
        self.from_number = config.get("whatsapp_from_number", "")

    async def send_message(self, to: str, message: str, subject: str = None) -> Dict:
        if not self.account_sid or not self.auth_token or not self.from_number:
            return {"success": False, "error": "Twilio WhatsApp non configuré"}

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth_str = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()

        whatsapp_from = self.from_number if self.from_number.startswith("whatsapp:") else f"whatsapp:{self.from_number}"
        whatsapp_to = to if to.startswith("whatsapp:") else f"whatsapp:{to}"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    data={"From": whatsapp_from, "To": whatsapp_to, "Body": message},
                    headers={"Authorization": f"Basic {auth_str}"},
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    return {"success": True, "sid": data.get("sid")}
                else:
                    error = resp.json().get("message", resp.text)
                    logger.error(f"Twilio WhatsApp error: {resp.status_code} - {error}")
                    return {"success": False, "error": f"WhatsApp: {error}"}
        except Exception as e:
            logger.error(f"WhatsApp send failed: {e}")
            return {"success": False, "error": str(e)}


class TelegramProvider(NotificationChannelProvider):
    """Send Telegram messages via Bot API."""

    def __init__(self, config: Dict):
        self.bot_token = config.get("bot_token", "")

    async def send_message(self, to: str, message: str, subject: str = None) -> Dict:
        if not self.bot_token:
            return {"success": False, "error": "Telegram Bot non configuré"}

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    json={"chat_id": to, "text": message, "parse_mode": "Markdown"},
                )
                if resp.status_code == 200 and resp.json().get("ok"):
                    return {"success": True, "message_id": resp.json()["result"]["message_id"]}
                else:
                    error = resp.json().get("description", resp.text)
                    logger.error(f"Telegram error: {error}")
                    return {"success": False, "error": f"Telegram: {error}"}
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return {"success": False, "error": str(e)}


class ChannelManager:
    """Facade that dispatches messages to the correct channel provider."""

    def __init__(self, db):
        self.db = db
        self._twilio_config = None
        self._telegram_config = None
        self._providers_loaded = False

    async def _load_configs(self):
        """Load channel configurations from MongoDB settings."""
        if self._providers_loaded:
            return

        twilio_doc = await self.db.settings.find_one({"key": "twilio"}, {"_id": 0})
        if twilio_doc and twilio_doc.get("value"):
            self._twilio_config = twilio_doc["value"]

        telegram_doc = await self.db.settings.find_one({"key": "telegram"}, {"_id": 0})
        if telegram_doc and telegram_doc.get("value"):
            self._telegram_config = telegram_doc["value"]

        self._providers_loaded = True

    async def reload_configs(self):
        """Force reload of channel configurations."""
        self._providers_loaded = False
        await self._load_configs()

    async def send(self, channel: str, to: str, message: str, subject: str = None) -> Dict:
        """Send a message via the specified channel."""
        await self._load_configs()

        if channel == "SMS":
            if not self._twilio_config or not self._twilio_config.get("enabled"):
                return {"success": False, "error": "SMS (Twilio) non activé"}
            provider = SmsProvider(self._twilio_config)
            return await provider.send_message(to, message, subject)

        elif channel == "WHATSAPP":
            if not self._twilio_config or not self._twilio_config.get("enabled"):
                return {"success": False, "error": "WhatsApp (Twilio) non activé"}
            provider = WhatsAppProvider(self._twilio_config)
            return await provider.send_message(to, message, subject)

        elif channel == "TELEGRAM":
            if not self._telegram_config or not self._telegram_config.get("enabled"):
                return {"success": False, "error": "Telegram non activé"}
            provider = TelegramProvider(self._telegram_config)
            return await provider.send_message(to, message, subject)

        elif channel == "EMAIL":
            from email_service import get_email_service
            email_svc = get_email_service()
            if not email_svc:
                return {"success": False, "error": "Service email non initialisé"}
            try:
                config = await email_svc.get_smtp_config()
                if not config or not config.get("enabled"):
                    return {"success": False, "error": "SMTP non activé"}
                result = email_svc._send_email_sync(
                    config=config, to_email=to, subject=subject or "OhmGuard - Alerte",
                    html_body=f"<div style='font-family:sans-serif;'>{message}</div>"
                )
                return result
            except Exception as e:
                return {"success": False, "error": str(e)}

        return {"success": False, "error": f"Canal inconnu: {channel}"}

    async def is_channel_available(self, channel: str) -> bool:
        """Check if a channel is configured and enabled."""
        await self._load_configs()
        if channel in ("SMS", "WHATSAPP"):
            return bool(self._twilio_config and self._twilio_config.get("enabled"))
        elif channel == "TELEGRAM":
            return bool(self._telegram_config and self._telegram_config.get("enabled"))
        elif channel == "EMAIL":
            from email_service import get_email_service
            email_svc = get_email_service()
            if email_svc:
                config = await email_svc.get_smtp_config()
                return bool(config and config.get("enabled"))
            return False
        return False


# Singleton
_channel_manager: Optional[ChannelManager] = None


def get_channel_manager() -> Optional[ChannelManager]:
    return _channel_manager


def init_channel_manager(db) -> ChannelManager:
    global _channel_manager
    _channel_manager = ChannelManager(db)
    return _channel_manager
