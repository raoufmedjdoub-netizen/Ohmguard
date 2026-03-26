"""
Email Service for OhmGuard
Sends alert emails via SMTP configured in the application settings.
"""
import smtplib
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate, make_msgid
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
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain=from_email.split("@")[-1] if "@" in from_email else "ohmguard.fr")
        msg.attach(MIMEText(html_body, "html"))

        try:
            if port == 465:
                # Port 465 = implicit SSL (SMTPS)
                server = smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context())
                server.ehlo(from_email.split("@")[-1] if "@" in from_email else "ohmguard.fr")
            elif use_tls:
                # Port 587 = STARTTLS
                server = smtplib.SMTP(host, port, timeout=15)
                server.ehlo(from_email.split("@")[-1] if "@" in from_email else "ohmguard.fr")
                server.starttls(context=ssl.create_default_context())
                server.ehlo(from_email.split("@")[-1] if "@" in from_email else "ohmguard.fr")
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

    async def send_welcome_email(self, to_email: str, full_name: str, temp_password: str, org_name: str = "", building_names: str = ""):
        """Send welcome email with temporary password to new user."""
        config = await self.get_smtp_config()
        if not config:
            raise Exception("Aucune configuration SMTP trouvée en base de données")
        if not config.get("enabled"):
            raise Exception(f"SMTP configuré mais désactivé (enabled=false)")

        logger.info(f"[Email] SMTP config found: host={config.get('host')}, port={config.get('port')}, from={config.get('from_email')}")

        subject = f"[OhmGuard] Bienvenue — Votre compte a été créé"
        html_body = self._build_welcome_email_html(full_name, to_email, temp_password, org_name, building_names)

        result = self._send_email_sync(config=config, to_email=to_email, subject=subject, html_body=html_body)
        if not result.get("success"):
            raise Exception(result.get("error", "Erreur inconnue lors de l'envoi"))
        logger.info(f"[Email] Welcome email sent to {to_email}")

    def _build_welcome_email_html(self, full_name: str, email: str, temp_password: str, org_name: str, building_names: str = "") -> str:
        context_parts = []
        if org_name:
            context_parts.append(f"l'organisation <strong>{org_name}</strong>")
        if building_names:
            context_parts.append(f"le bâtiment <strong>{building_names}</strong>")
        context_line = f" pour {' et '.join(context_parts)}" if context_parts else ""
        return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>OhmGuard - Bienvenue</title>
<!--[if mso]>
<style type="text/css">
table {{border-collapse:collapse;border-spacing:0;margin:0;}}
td {{border-collapse:collapse;border-spacing:0;}}
</style>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">

<!-- Container -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

<!-- Header -->
<tr>
<td align="center" style="background-color:#1E3A5F;padding:28px 24px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:1px;">OhmGuard</td></tr>
<tr><td align="center" style="font-size:13px;color:#b0c4de;padding-top:6px;">Bienvenue sur la plateforme</td></tr>
</table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="background-color:#ffffff;padding:28px 28px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;">

<p style="color:#1f2937;font-size:15px;line-height:1.5;margin:0 0 16px;">Bonjour <strong>{full_name}</strong>,</p>
<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 20px;">Un compte a été créé pour vous sur la plateforme OhmGuard{context_line}. Voici vos identifiants de connexion :</p>

<!-- Credentials box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;background-color:#f9fafb;">
<tr>
<td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:#6b7280;font-size:13px;font-family:Arial,Helvetica,sans-serif;width:40%;">Email</td>
<td style="color:#1f2937;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">{email}</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="color:#6b7280;font-size:13px;font-family:Arial,Helvetica,sans-serif;width:40%;">Mot de passe</td>
<td style="color:#1f2937;font-size:15px;font-weight:700;font-family:Consolas,'Courier New',monospace;letter-spacing:1.5px;">{temp_password}</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Login button -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr>
<td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" style="background-color:#1E3A5F;padding:12px 32px;">
<a href="https://app.ohmguard.fr" target="_blank" style="color:#ffffff;font-size:14px;font-weight:600;font-family:Arial,Helvetica,sans-serif;text-decoration:none;display:inline-block;">Se connecter à OhmGuard</a>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Warning box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
<tr>
<td style="background-color:#FEF3C7;border:1px solid #F59E0B;padding:14px 18px;">
<p style="color:#92400E;font-size:13px;font-family:Arial,Helvetica,sans-serif;margin:0;line-height:1.5;">
<strong>&#9888; Important :</strong> Vous devrez changer ce mot de passe lors de votre première connexion.
</p>
</td>
</tr>
</table>

<p style="color:#9ca3af;font-size:12px;font-family:Arial,Helvetica,sans-serif;margin:20px 0 0;line-height:1.5;">
Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.
</p>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f9fafb;padding:16px 28px;border:1px solid #e5e7eb;border-top:none;">
<p style="color:#9ca3af;font-size:11px;font-family:Arial,Helvetica,sans-serif;margin:0;text-align:center;line-height:1.5;">
OhmGuard &mdash; Système de surveillance et détection de chute
</p>
</td>
</tr>

</table>
<!-- /Container -->

</td></tr>
</table>
</body>
</html>"""

    def _build_test_email_html(self) -> str:
        return """<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td align="center" style="background-color:#1E3A5F;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:1px;">OhmGuard</td></tr>
<tr><td style="background-color:#ffffff;padding:28px;border:1px solid #e5e7eb;border-top:none;font-family:Arial,Helvetica,sans-serif;">
<p style="color:#16a34a;font-size:18px;font-weight:700;margin:0 0 12px;">&#10003; Connexion SMTP réussie</p>
<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Votre configuration email fonctionne correctement. Les alertes de chute seront envoyées via ce serveur SMTP.</p>
<p style="color:#9ca3af;font-size:12px;margin:0;">Ce message est un test automatique envoyé depuis OhmGuard.</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:14px 28px;border:1px solid #e5e7eb;border-top:none;">
<p style="color:#9ca3af;font-size:11px;font-family:Arial,Helvetica,sans-serif;margin:0;text-align:center;">OhmGuard &mdash; Système de surveillance et détection de chute</p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""

    def _build_fall_alert_html(self, sensor_name: str, location: str, timestamp: str, event: Dict) -> str:
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            time_str = dt.strftime("%d/%m/%Y à %H:%M:%S")
        except Exception:
            time_str = timestamp

        return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

<!-- Red header -->
<tr><td align="center" style="background-color:#DC2626;padding:24px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:1px;">&#9888; ALERTE CHUTE</td></tr>
</table>
</td></tr>

<!-- Body -->
<tr><td style="background-color:#ffffff;padding:24px 28px;border-left:1px solid #fecaca;border-right:1px solid #fecaca;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #fecaca;background-color:#fef2f2;">
<tr>
<td style="padding:12px 18px;border-bottom:1px solid #fecaca;color:#6b7280;font-size:13px;width:35%;">Capteur</td>
<td style="padding:12px 18px;border-bottom:1px solid #fecaca;color:#1f2937;font-size:14px;font-weight:600;">{sensor_name}</td>
</tr>
<tr>
<td style="padding:12px 18px;border-bottom:1px solid #fecaca;color:#6b7280;font-size:13px;">Localisation</td>
<td style="padding:12px 18px;border-bottom:1px solid #fecaca;color:#1f2937;font-size:14px;font-weight:600;">{location}</td>
</tr>
<tr>
<td style="padding:12px 18px;color:#6b7280;font-size:13px;">Date / Heure</td>
<td style="padding:12px 18px;color:#1f2937;font-size:14px;font-weight:600;">{time_str}</td>
</tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
<tr><td style="background-color:#FEE2E2;border:1px solid #FECACA;padding:14px 18px;">
<p style="color:#991b1b;font-size:14px;font-weight:700;margin:0;">Action requise : veuillez vérifier immédiatement.</p>
</td></tr>
</table>
</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f9fafb;padding:14px 28px;border:1px solid #fecaca;border-top:none;">
<p style="color:#9ca3af;font-size:11px;font-family:Arial,Helvetica,sans-serif;margin:0;text-align:center;">OhmGuard &mdash; Système de détection de chute</p>
</td></tr>

</table>
</td></tr></table>
</body></html>
        """


# Singleton
_email_service: Optional[EmailService] = None


def get_email_service() -> Optional[EmailService]:
    return _email_service


def init_email_service(db) -> EmailService:
    global _email_service
    _email_service = EmailService(db)
    return _email_service
