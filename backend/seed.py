"""
Seed script for OhmGuard - Creates essential platform data
Real Vayyar radars are auto-detected via MQTT - no mock sensors created

Run with: python seed.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import uuid
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("🌱 Starting OhmGuard seed...")
    
    # Only clear non-sensor data (keep real radars detected via MQTT)
    collections_to_clear = ['tenants', 'sites', 'zones', 'users', 'alert_rules', 'notification_logs', 'audit_logs']
    for col in collections_to_clear:
        await db[col].delete_many({})
    print("✓ Cleared platform data (keeping real sensors)")
    
    # Create Tenant
    tenant_id = str(uuid.uuid4())
    tenant = {
        "id": tenant_id,
        "name": "EHPAD Les Jardins",
        "settings": {
            "retention_days": 90,
            "anonymize_images": True,
            "timezone": "Europe/Paris"
        },
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tenants.insert_one(tenant)
    print(f"✓ Created tenant: {tenant['name']}")
    
    # Create Sites
    sites = [
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Bâtiment Principal", "address": "12 Rue des Lilas, 75001 Paris"},
        {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": "Annexe Sud", "address": "14 Rue des Lilas, 75001 Paris"},
    ]
    for site in sites:
        site["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.sites.insert_many(sites)
    print(f"✓ Created {len(sites)} sites")
    
    # Create Zones
    zones = []
    zone_names = [
        ("Chambre 101", "1er étage"), ("Chambre 102", "1er étage"), ("Couloir Nord", "1er étage"),
        ("Salle commune", "RDC"), ("Accueil", "RDC")
    ]
    for i, (name, floor) in enumerate(zone_names):
        zone = {
            "id": str(uuid.uuid4()),
            "name": name,
            "site_id": sites[0]["id"] if i < 3 else sites[1]["id"],
            "floor": floor,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        zones.append(zone)
    await db.zones.insert_many(zones)
    print(f"✓ Created {len(zones)} zones")
    
    # Update existing sensors with tenant_id and site_id if they don't have one
    existing_sensors = await db.sensors.count_documents({})
    if existing_sensors > 0:
        # Assign real radars to first zone
        await db.sensors.update_many(
            {"tenant_id": {"$exists": False}},
            {"$set": {
                "tenant_id": tenant_id,
                "site_id": sites[0]["id"],
                "zone_id": zones[0]["id"]
            }}
        )
        print(f"✓ Updated {existing_sensors} existing sensors with tenant/site/zone")
    else:
        print("ℹ No existing sensors - Vayyar radars will be auto-detected via MQTT")
    
    # Create Users
    users = [
        {
            "id": str(uuid.uuid4()),
            "email": "admin@ohmguard.io",
            "full_name": "Super Admin",
            "role": "SUPER_ADMIN",
            "tenant_id": None,
            "is_active": True,
            "hashed_password": pwd_context.hash("admin123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "directeur@jardins-ehpad.fr",
            "full_name": "Jean Dupont",
            "role": "TENANT_ADMIN",
            "tenant_id": tenant_id,
            "is_active": True,
            "hashed_password": pwd_context.hash("directeur123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "superviseur@jardins-ehpad.fr",
            "full_name": "Marie Martin",
            "role": "SUPERVISOR",
            "tenant_id": tenant_id,
            "is_active": True,
            "hashed_password": pwd_context.hash("super123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "operateur@jardins-ehpad.fr",
            "full_name": "Pierre Bernard",
            "role": "OPERATOR",
            "tenant_id": tenant_id,
            "is_active": True,
            "hashed_password": pwd_context.hash("oper123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "viewer@jardins-ehpad.fr",
            "full_name": "Sophie Leroy",
            "role": "VIEWER",
            "tenant_id": tenant_id,
            "is_active": True,
            "hashed_password": pwd_context.hash("view123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.users.insert_many(users)
    print(f"✓ Created {len(users)} users")
    
    # Create Alert Rules
    alert_rules = [
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "Alerte Chute Critique",
            "description": "Notification immédiate pour toutes les chutes HIGH",
            "event_types": ["FALL"],
            "min_severity": "HIGH",
            "site_id": None,
            "channels": ["in_app", "webhook"],
            "webhook_url": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "name": "Alerte Pré-chute",
            "description": "Surveillance des événements de pré-chute",
            "event_types": ["PRE_FALL", "FALL"],
            "min_severity": "MED",
            "site_id": sites[0]["id"],
            "channels": ["in_app"],
            "webhook_url": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.alert_rules.insert_many(alert_rules)
    print(f"✓ Created {len(alert_rules)} alert rules")
    
    # Create Configuration Templates
    templates = [
        {
            "id": str(uuid.uuid4()),
            "name": "Standard EHPAD",
            "description": "Configuration standard pour les chambres d'EHPAD",
            "config": {
                "appConfig": {
                    "silentMode": False,
                    "enableTestMode": False,
                    "sensitivityLevel": 0.7,
                    "telemetryPolicy": "On"
                },
                "walabotConfig": {
                    "fallingSensitivity": "MediumSensitivity",
                    "sensorMounting": "Wall",
                    "sensorHeight": 1.5
                },
                "rfProfile": {"rfRegulationZone": "EU", "rfBandWidth": "BW500"},
                "productType": "Falling"
            },
            "tenantId": tenant_id,
            "createdAt": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Haute Sensibilité",
            "description": "Configuration pour patients à haut risque",
            "config": {
                "appConfig": {
                    "silentMode": False,
                    "enableTestMode": False,
                    "sensitivityLevel": 0.9,
                    "telemetryPolicy": "On",
                    "enableSensitiveMode": True
                },
                "walabotConfig": {
                    "fallingSensitivity": "HighSensitivity",
                    "sensorMounting": "Wall",
                    "sensorHeight": 1.5,
                    "bedExitEnabled": True
                },
                "rfProfile": {"rfRegulationZone": "EU", "rfBandWidth": "BW500"},
                "productType": "Falling"
            },
            "tenantId": tenant_id,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.config_templates.insert_many(templates)
    print(f"✓ Created {len(templates)} configuration templates")
    
    print("\n" + "="*50)
    print("✅ OhmGuard seed completed!")
    print("="*50)
    print("\n📋 Credentials:")
    print("  Super Admin:    admin@ohmguard.io / admin123")
    print("  Tenant Admin:   directeur@jardins-ehpad.fr / directeur123")
    print("  Supervisor:     superviseur@jardins-ehpad.fr / super123")
    print("  Operator:       operateur@jardins-ehpad.fr / oper123")
    print("  Viewer:         viewer@jardins-ehpad.fr / view123")
    print("\n📡 MQTT:")
    print("  Vayyar radars are auto-detected via MQTT broker")
    print("  Config topic: /devices/{deviceId}/config")
    print("  ACK topic: /devices/{deviceId}/config/ack")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
