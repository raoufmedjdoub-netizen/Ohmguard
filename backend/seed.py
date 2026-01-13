"""
Seed script for FallGuard - Creates demo data
Run with: python seed.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
import uuid
import os
from dotenv import load_dotenv
from pathlib import Path
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("🌱 Starting FallGuard seed...")
    
    # Clear existing data
    collections = ['tenants', 'sites', 'zones', 'sensors', 'events', 'users', 'alert_rules', 'notification_logs', 'audit_logs']
    for col in collections:
        await db[col].delete_many({})
    print("✓ Cleared existing data")
    
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
        {
            "id": str(uuid.uuid4()),
            "name": "Bâtiment A - Résidence Principale",
            "address": "12 Rue des Lilas, 75015 Paris",
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Bâtiment B - Unité Alzheimer",
            "address": "14 Rue des Lilas, 75015 Paris",
            "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.sites.insert_many(sites)
    print(f"✓ Created {len(sites)} sites")
    
    # Create Zones
    zones = []
    zone_names = [
        ("Couloir Étage 1", "1"),
        ("Couloir Étage 2", "2"),
        ("Salle Commune", "0"),
        ("Chambre 101-110", "1"),
        ("Chambre 201-210", "2")
    ]
    for i, (name, floor) in enumerate(zone_names):
        zone = {
            "id": str(uuid.uuid4()),
            "name": name,
            "site_id": sites[i % 2]["id"],
            "floor": floor,
            "description": f"Zone de surveillance {name}",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        zones.append(zone)
    await db.zones.insert_many(zones)
    print(f"✓ Created {len(zones)} zones")
    
    # Create Sensors
    sensors = []
    sensor_types = ["RADAR", "CAMERA", "IOT"]
    sensor_models = {
        "RADAR": ["Vayyar Walabot", "Novelda XeThru"],
        "CAMERA": ["Hikvision DS-2CD", "Axis P3245"],
        "IOT": ["Philips Lifeline", "Medical Guardian"]
    }
    
    for i in range(10):
        s_type = sensor_types[i % 3]
        zone = zones[i % len(zones)]
        site = next(s for s in sites if s["id"] == zone["site_id"])
        sensor = {
            "id": str(uuid.uuid4()),
            "name": f"Capteur-{s_type[:3]}-{i+1:03d}",
            "type": s_type,
            "model": random.choice(sensor_models[s_type]),
            "firmware": f"v{random.randint(1,3)}.{random.randint(0,9)}.{random.randint(0,99)}",
            "zone_id": zone["id"],
            "site_id": site["id"],
            "tenant_id": tenant_id,
            "api_key": f"sk_{uuid.uuid4().hex}",
            "status": random.choice(["ONLINE", "ONLINE", "ONLINE", "OFFLINE"]),
            "last_seen": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(0, 120))).isoformat() if random.random() > 0.2 else None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        sensors.append(sensor)
    await db.sensors.insert_many(sensors)
    print(f"✓ Created {len(sensors)} sensors")
    
    # Create Events
    events = []
    event_types = ["FALL", "FALL", "FALL", "PRE_FALL", "UNKNOWN"]
    severities = ["HIGH", "HIGH", "MED", "LOW"]
    statuses = ["NEW", "NEW", "ACK", "RESOLVED", "FALSE_ALARM"]
    
    for i in range(50):
        sensor = random.choice(sensors)
        event_time = datetime.now(timezone.utc) - timedelta(hours=random.randint(0, 72), minutes=random.randint(0, 59))
        event = {
            "id": str(uuid.uuid4()),
            "sensor_id": sensor["id"],
            "tenant_id": tenant_id,
            "site_id": sensor["site_id"],
            "zone_id": sensor["zone_id"],
            "timestamp": event_time.isoformat(),
            "type": random.choice(event_types),
            "confidence": round(random.uniform(0.7, 0.99), 2),
            "severity": random.choice(severities),
            "anonymized_snapshot_url": f"https://fallguard.local/snapshots/{uuid.uuid4().hex}.jpg" if random.random() > 0.5 else None,
            "raw_payload": {"sensor_data": {"accelerometer": [random.uniform(-1, 1) for _ in range(3)]}},
            "status": random.choice(statuses),
            "assigned_to": None,
            "notes": "Intervention effectuée" if random.random() > 0.7 else None
        }
        events.append(event)
    
    # Sort by timestamp descending
    events.sort(key=lambda x: x["timestamp"], reverse=True)
    await db.events.insert_many(events)
    print(f"✓ Created {len(events)} events")
    
    # Create Users
    users = [
        {
            "id": str(uuid.uuid4()),
            "email": "admin@fallguard.io",
            "full_name": "Admin Système",
            "role": "SUPER_ADMIN",
            "tenant_id": None,
            "language": "fr",
            "is_active": True,
            "hashed_password": pwd_context.hash("admin123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "directeur@jardins-ehpad.fr",
            "full_name": "Marie Dupont",
            "role": "TENANT_ADMIN",
            "tenant_id": tenant_id,
            "language": "fr",
            "is_active": True,
            "hashed_password": pwd_context.hash("directeur123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "superviseur@jardins-ehpad.fr",
            "full_name": "Jean Martin",
            "role": "SUPERVISOR",
            "tenant_id": tenant_id,
            "language": "fr",
            "is_active": True,
            "hashed_password": pwd_context.hash("super123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "operateur@jardins-ehpad.fr",
            "full_name": "Sophie Bernard",
            "role": "OPERATOR",
            "tenant_id": tenant_id,
            "language": "fr",
            "is_active": True,
            "hashed_password": pwd_context.hash("oper123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "email": "viewer@jardins-ehpad.fr",
            "full_name": "Pierre Leroy",
            "role": "VIEWER",
            "tenant_id": tenant_id,
            "language": "fr",
            "is_active": True,
            "hashed_password": pwd_context.hash("view123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.users.insert_many(users)
    print(f"✓ Created {len(users)} users")
    
    # Create Alert Rules
    rules = [
        {
            "id": str(uuid.uuid4()),
            "name": "Alerte Chute Critique",
            "tenant_id": tenant_id,
            "site_id": None,
            "event_types": ["FALL"],
            "min_severity": "HIGH",
            "channels": ["in_app", "email", "webhook"],
            "webhook_url": "https://webhook.site/fallguard-demo",
            "escalation_minutes": 5,
            "escalation_group": "superviseurs",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Alerte Pré-Chute",
            "tenant_id": tenant_id,
            "site_id": sites[0]["id"],
            "event_types": ["PRE_FALL", "FALL"],
            "min_severity": "MED",
            "channels": ["in_app"],
            "webhook_url": None,
            "escalation_minutes": 10,
            "escalation_group": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.alert_rules.insert_many(rules)
    print(f"✓ Created {len(rules)} alert rules")
    
    # Create sample notification logs
    notifications = []
    for event in events[:10]:
        notification = {
            "id": str(uuid.uuid4()),
            "event_id": event["id"],
            "tenant_id": tenant_id,
            "channel": random.choice(["in_app", "email", "webhook"]),
            "recipient": "superviseurs",
            "status": "sent",
            "message": f"Alerte {event['type']} détectée - Confiance: {event['confidence']*100:.0f}%",
            "created_at": event["timestamp"]
        }
        notifications.append(notification)
    await db.notification_logs.insert_many(notifications)
    print(f"✓ Created {len(notifications)} notification logs")
    
    print("\n" + "="*50)
    print("🎉 Seed completed successfully!")
    print("="*50)
    print("\n📋 Test Accounts:")
    print("-"*50)
    print("Super Admin:    admin@fallguard.io / admin123")
    print("Tenant Admin:   directeur@jardins-ehpad.fr / directeur123")
    print("Supervisor:     superviseur@jardins-ehpad.fr / super123")
    print("Operator:       operateur@jardins-ehpad.fr / oper123")
    print("Viewer:         viewer@jardins-ehpad.fr / view123")
    print("-"*50)
    print(f"\n📊 Data Summary:")
    print(f"   Tenants: 1")
    print(f"   Sites: {len(sites)}")
    print(f"   Zones: {len(zones)}")
    print(f"   Sensors: {len(sensors)}")
    print(f"   Events: {len(events)}")
    print(f"   Users: {len(users)}")
    print(f"   Alert Rules: {len(rules)}")
    
    # Print a sample sensor API key for testing
    print(f"\n🔑 Sample Sensor API Key (for device testing):")
    print(f"   Sensor: {sensors[0]['name']}")
    print(f"   API Key: {sensors[0]['api_key']}")
    print(f"   Sensor ID: {sensors[0]['id']}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
