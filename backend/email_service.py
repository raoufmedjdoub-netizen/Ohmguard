"""
Email Service for OhmGuard
Sends alert emails via SMTP configured in the application settings.
"""
import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class EmailService:
    """Sends emails using SMTP settings stored in MongoDB."""

    def __init__(self, db):
        self.db = db

    async def get_smtp_config(self) -> Optional[Dict]:
        """Load SMTP config from settings collection."""
        config = await self.db.settings.find_one({"key": "smtp"}, {"_id": 0})
        if config and config.get("value"):
            return config["value"]
        return None

    async def save_smtp_config(self, config: Dict):
        """Save SMTP config to settings collection."""
        await self.db.settings.update_one(
            {"key": "smtp"},
            {"$set": {"key": "smtp", "value": config, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )

    async def test_connection(self, config: Dict = None) -> Dict:
        """Test SMTP connection and optionally send a test email."""
        if not config:
            config = await self.get_smtp_config()
        if not config:
            return {"success": False, "error": "Aucune configuration SMTP trouvée"}

        try:
            result = self._send_email_sync(
                config=config,
                to_email=config.get("from_email", config.get("username")),
                subject="[OhmGuard] Test de connexion SMTP",
                html_body=self._build_test_email_html()
            )
            return result
        except Exception as e:
            logger.error(f"SMTP test failed: {e}")
            return {"success": False, "error": str(e)}

    async def send_fall_alert(self, event: Dict, sensor: Dict, recipients: List[str]):
        """Send a FALL alert email to specified recipients."""
        config = await self.get_smtp_config()
        if not config or not config.get("enabled"):
            return

        if not recipients:
            return

        sensor_name = sensor.get("name", "Capteur inconnu")
        location = sensor.get("room_name", sensor.get("building_name", "Localisation inconnue"))
        timestamp = event.get("timestamp", datetime.now(timezone.utc).isoformat())

        subject = f"[ALERTE CHUTE] {sensor_name} - {location}"
        html_body = self._build_fall_alert_html(sensor_name, location, timestamp, event)

        for email in recipients:
            try:
                self._send_email_sync(config=config, to_email=email, subject=subject, html_body=html_body)
                logger.info(f"Fall alert sent to {email} for sensor {sensor_name}")
            except Exception as e:
                logger.error(f"Failed to send fall alert to {email}: {e}")

    def _send_email_sync(self, config: Dict, to_email: str, subject: str, html_body: str) -> Dict:
        """Send an email synchronously via SMTP."""
        host = config.get("host", "")
        port = int(config.get("port", 587))
        username = config.get("username", "")
        password = config.get("password", "")
        from_email = config.get("from_email", username)
        from_name = config.get("from_name", "OhmGuard Alerts")
        use_tls = config.get("use_tls", True)

        if not host or not username or not password:
            return {"success": False, "error": "Configuration SMTP incomplète"}

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        try:
            if port == 465:
                # Port 465 = implicit SSL (SMTPS)
                server = smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context())
            elif use_tls:
                # Port 587 = STARTTLS
                server = smtplib.SMTP(host, port, timeout=15)
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            else:
                # Plain SMTP (no encryption)
                server = smtplib.SMTP(host, port, timeout=15)

            server.login(username, password)
            server.sendmail(from_email, to_email, msg.as_string())
            server.quit()
            return {"success": True, "message": f"Email envoyé à {to_email}"}
        except smtplib.SMTPAuthenticationError:
            return {"success": False, "error": "Identifiants SMTP incorrects"}
        except smtplib.SMTPConnectError as e:
            return {"success": False, "error": f"Impossible de se connecter à {host}:{port} - {e}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _build_test_email_html(self) -> str:
        return """
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <div style="background: #1E3A5F; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="margin: 0;">OhmGuard</h2>
            </div>
            <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <h3 style="color: #16a34a; margin-top: 0;">Connexion SMTP réussie</h3>
                <p style="color: #4b5563;">Votre configuration email fonctionne correctement. Les alertes de chute seront envoyées via ce serveur SMTP.</p>
                <p style="color: #9ca3af; font-size: 12px;">Ce message est un test automatique envoyé depuis OhmGuard.</p>
            </div>
        </div>
        """

    def _build_fall_alert_html(self, sensor_name: str, location: str, timestamp: str, event: Dict) -> str:
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            time_str = dt.strftime("%d/%m/%Y à %H:%M:%S")
        except Exception:
            time_str = timestamp

        return f"""
        <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="margin: 0;">ALERTE CHUTE</h2>
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
                OhmGuard - Système de détection de chute
            </p>
        </div>
        """


# Singleton
_email_service: Optional[EmailService] = None


def get_email_service() -> Optional[EmailService]:
    return _email_service


def init_email_service(db) -> EmailService:
    global _email_service
    _email_service = EmailService(db)
    return _email_service
