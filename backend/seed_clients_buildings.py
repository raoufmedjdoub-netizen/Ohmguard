"""
Seed script for Clients & Buildings demo data
Creates 2 clients, buildings, floors, rooms, and assigns radars
"""

import asyncio
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()


async def seed_clients_buildings():
    """Seed demo data for clients and buildings hierarchy"""
    
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    
    print("🏢 Seeding Clients & Buildings data...")
    
    # Clear existing data (optional - comment out to preserve)
    # await db.clients.delete_many({})
    # await db.buildings.delete_many({})
    # await db.floors.delete_many({})
    # await db.rooms.delete_many({})
    # await db.room_spaces.delete_many({})
    # await db.zones_new.delete_many({})
    # await db.radar_assignments.delete_many({})
    
    now = datetime.now(timezone.utc).isoformat()
    
    # ==================== CLIENT 1: EHPAD Les Jardins ====================
    client1_id = str(uuid.uuid4())
    client1 = {
        "id": client1_id,
        "name": "EHPAD Les Jardins du Parc",
        "legal_name": "Association Les Jardins du Parc",
        "siret": "12345678901234",
        "address": {
            "street": "15 Avenue des Fleurs",
            "city": "Lyon",
            "postal_code": "69003",
            "country": "France"
        },
        "timezone": "Europe/Paris",
        "retention_days": 365,
        "contact_email": "direction@jardins-parc.fr",
        "contact_phone": "+33 4 72 00 00 00",
        "status": "ACTIVE",
        "created_at": now,
        "updated_at": now
    }
    
    # Building 1A: Résidence Principale
    building1a_id = str(uuid.uuid4())
    building1a = {
        "id": building1a_id,
        "client_id": client1_id,
        "name": "Résidence Principale",
        "address": {
            "street": "15 Avenue des Fleurs - Bâtiment A",
            "city": "Lyon",
            "postal_code": "69003",
            "country": "France"
        },
        "contact_name": "Marie Dupont",
        "contact_email": "m.dupont@jardins-parc.fr",
        "contact_phone": "+33 4 72 00 00 01",
        "created_at": now,
        "updated_at": now
    }
    
    # Floors for Building 1A
    floors_1a = []
    rooms_1a = []
    spaces_1a = []
    zones_1a = []
    
    floor_names = ["Rez-de-chaussée", "1er étage", "2ème étage"]
    
    for floor_idx, floor_name in enumerate(floor_names):
        floor_id = str(uuid.uuid4())
        floors_1a.append({
            "id": floor_id,
            "building_id": building1a_id,
            "client_id": client1_id,
            "name": floor_name,
            "index": floor_idx,
            "created_at": now,
            "updated_at": now
        })
        
        # Add corridor zone
        zones_1a.append({
            "id": str(uuid.uuid4()),
            "building_id": building1a_id,
            "floor_id": floor_id,
            "client_id": client1_id,
            "name": f"Couloir {floor_name}",
            "zone_type": "CORRIDOR",
            "created_at": now,
            "updated_at": now
        })
        
        # Create 8 rooms per floor
        base_room_num = (floor_idx * 100) + 100
        for room_num in range(1, 9):
            room_id = str(uuid.uuid4())
            room_number = str(base_room_num + room_num)
            
            # Determine room type
            room_type = "SINGLE" if room_num % 3 != 0 else "DOUBLE"
            
            rooms_1a.append({
                "id": room_id,
                "building_id": building1a_id,
                "floor_id": floor_id,
                "client_id": client1_id,
                "room_number": room_number,
                "name": f"Chambre {room_number}",
                "room_type": room_type,
                "capacity": 1 if room_type == "SINGLE" else 2,
                "created_at": now,
                "updated_at": now
            })
            
            # Always create bedroom
            spaces_1a.append({
                "id": str(uuid.uuid4()),
                "room_id": room_id,
                "building_id": building1a_id,
                "floor_id": floor_id,
                "client_id": client1_id,
                "name": "Chambre à coucher",
                "space_type": "BEDROOM",
                "is_active": True,
                "created_at": now,
                "updated_at": now
            })
            
            # Add bathroom to 70% of rooms
            if room_num % 3 != 2:
                spaces_1a.append({
                    "id": str(uuid.uuid4()),
                    "room_id": room_id,
                    "building_id": building1a_id,
                    "floor_id": floor_id,
                    "client_id": client1_id,
                    "name": "Salle de bain",
                    "space_type": "BATHROOM",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now
                })
            
            # Add kitchenette to suites only
            if room_type == "DOUBLE":
                spaces_1a.append({
                    "id": str(uuid.uuid4()),
                    "room_id": room_id,
                    "building_id": building1a_id,
                    "floor_id": floor_id,
                    "client_id": client1_id,
                    "name": "Kitchenette",
                    "space_type": "KITCHENETTE",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now
                })
    
    # Add common areas for building 1A
    zones_1a.append({
        "id": str(uuid.uuid4()),
        "building_id": building1a_id,
        "floor_id": floors_1a[0]["id"],  # Ground floor
        "client_id": client1_id,
        "name": "Hall d'entrée",
        "zone_type": "LOBBY",
        "created_at": now,
        "updated_at": now
    })
    zones_1a.append({
        "id": str(uuid.uuid4()),
        "building_id": building1a_id,
        "floor_id": floors_1a[0]["id"],
        "client_id": client1_id,
        "name": "Salle commune",
        "zone_type": "COMMON",
        "created_at": now,
        "updated_at": now
    })
    
    # Building 1B: Annexe
    building1b_id = str(uuid.uuid4())
    building1b = {
        "id": building1b_id,
        "client_id": client1_id,
        "name": "Annexe Médicale",
        "address": {
            "street": "15 Avenue des Fleurs - Bâtiment B",
            "city": "Lyon",
            "postal_code": "69003",
            "country": "France"
        },
        "created_at": now,
        "updated_at": now
    }
    
    # One floor for building 1B
    floor_1b_id = str(uuid.uuid4())
    floors_1b = [{
        "id": floor_1b_id,
        "building_id": building1b_id,
        "client_id": client1_id,
        "name": "Rez-de-chaussée",
        "index": 0,
        "created_at": now,
        "updated_at": now
    }]
    
    # 4 medical rooms
    rooms_1b = []
    spaces_1b = []
    for i in range(1, 5):
        room_id = str(uuid.uuid4())
        rooms_1b.append({
            "id": room_id,
            "building_id": building1b_id,
            "floor_id": floor_1b_id,
            "client_id": client1_id,
            "room_number": f"M{i}",
            "name": f"Salle médicale {i}",
            "room_type": "OTHER",
            "capacity": 1,
            "created_at": now,
            "updated_at": now
        })
        spaces_1b.append({
            "id": str(uuid.uuid4()),
            "room_id": room_id,
            "building_id": building1b_id,
            "floor_id": floor_1b_id,
            "client_id": client1_id,
            "name": "Espace principal",
            "space_type": "OTHER",
            "is_active": True,
            "created_at": now,
            "updated_at": now
        })
    
    zones_1b = [{
        "id": str(uuid.uuid4()),
        "building_id": building1b_id,
        "floor_id": floor_1b_id,
        "client_id": client1_id,
        "name": "Couloir médical",
        "zone_type": "CORRIDOR",
        "created_at": now,
        "updated_at": now
    }]
    
    # ==================== CLIENT 2: Résidence Seniors ====================
    client2_id = str(uuid.uuid4())
    client2 = {
        "id": client2_id,
        "name": "Résidence Seniors Les Cèdres",
        "legal_name": "SCI Les Cèdres",
        "siret": "98765432109876",
        "address": {
            "street": "42 Rue des Cèdres",
            "city": "Paris",
            "postal_code": "75015",
            "country": "France"
        },
        "timezone": "Europe/Paris",
        "retention_days": 180,
        "contact_email": "contact@cedres-seniors.fr",
        "status": "ACTIVE",
        "created_at": now,
        "updated_at": now
    }
    
    # One building for client 2
    building2_id = str(uuid.uuid4())
    building2 = {
        "id": building2_id,
        "client_id": client2_id,
        "name": "Tour des Cèdres",
        "address": {
            "street": "42 Rue des Cèdres",
            "city": "Paris",
            "postal_code": "75015",
            "country": "France"
        },
        "created_at": now,
        "updated_at": now
    }
    
    # 4 floors
    floors_2 = []
    rooms_2 = []
    spaces_2 = []
    zones_2 = []
    
    for floor_idx in range(4):
        floor_id = str(uuid.uuid4())
        floor_name = "Rez-de-chaussée" if floor_idx == 0 else f"{floor_idx}{'er' if floor_idx == 1 else 'ème'} étage"
        floors_2.append({
            "id": floor_id,
            "building_id": building2_id,
            "client_id": client2_id,
            "name": floor_name,
            "index": floor_idx,
            "created_at": now,
            "updated_at": now
        })
        
        zones_2.append({
            "id": str(uuid.uuid4()),
            "building_id": building2_id,
            "floor_id": floor_id,
            "client_id": client2_id,
            "name": f"Couloir {floor_name}",
            "zone_type": "CORRIDOR",
            "created_at": now,
            "updated_at": now
        })
        
        # 6 rooms per floor (studios)
        for room_num in range(1, 7):
            room_id = str(uuid.uuid4())
            room_number = f"{floor_idx + 1}{room_num:02d}"
            
            rooms_2.append({
                "id": room_id,
                "building_id": building2_id,
                "floor_id": floor_id,
                "client_id": client2_id,
                "room_number": room_number,
                "name": f"Studio {room_number}",
                "room_type": "STUDIO",
                "capacity": 1,
                "created_at": now,
                "updated_at": now
            })
            
            # Studios have bedroom, bathroom, and kitchenette
            for space_type, space_name in [("BEDROOM", "Espace nuit"), ("BATHROOM", "Salle d'eau"), ("KITCHENETTE", "Coin cuisine")]:
                spaces_2.append({
                    "id": str(uuid.uuid4()),
                    "room_id": room_id,
                    "building_id": building2_id,
                    "floor_id": floor_id,
                    "client_id": client2_id,
                    "name": space_name,
                    "space_type": space_type,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now
                })
    
    # ==================== INSERT DATA ====================
    
    # Check if data already exists
    existing = await db.clients.find_one({"name": client1["name"]})
    if existing:
        print("⚠️  Demo data already exists. Skipping...")
        return
    
    # Insert clients
    await db.clients.insert_many([client1, client2])
    print(f"✅ Created 2 clients")
    
    # Insert buildings
    await db.buildings.insert_many([building1a, building1b, building2])
    print(f"✅ Created 3 buildings")
    
    # Insert floors
    all_floors = floors_1a + floors_1b + floors_2
    await db.floors.insert_many(all_floors)
    print(f"✅ Created {len(all_floors)} floors")
    
    # Insert rooms
    all_rooms = rooms_1a + rooms_1b + rooms_2
    await db.rooms.insert_many(all_rooms)
    print(f"✅ Created {len(all_rooms)} rooms")
    
    # Insert room spaces
    all_spaces = spaces_1a + spaces_1b + spaces_2
    await db.room_spaces.insert_many(all_spaces)
    print(f"✅ Created {len(all_spaces)} room spaces")
    
    # Insert zones
    all_zones = zones_1a + zones_1b + zones_2
    await db.zones_new.insert_many(all_zones)
    print(f"✅ Created {len(all_zones)} zones")
    
    # ==================== ASSIGN RADARS ====================
    
    # Get existing radars
    radars = await db.sensors.find({}, {"id": 1}).to_list(100)
    
    if radars:
        # Assign first radar to a bedroom in client 1
        bedroom_space = await db.room_spaces.find_one({
            "client_id": client1_id,
            "space_type": "BEDROOM"
        })
        if bedroom_space:
            await db.sensors.update_one(
                {"id": radars[0]["id"]},
                {"$set": {
                    "client_id": client1_id,
                    "building_id": bedroom_space["building_id"],
                    "floor_id": bedroom_space["floor_id"],
                    "room_id": bedroom_space["room_id"],
                    "room_space_id": bedroom_space["id"]
                }}
            )
            print(f"✅ Assigned radar 1 to bedroom")
        
        # Assign second radar to a bathroom in client 1 (if exists)
        if len(radars) > 1:
            bathroom_space = await db.room_spaces.find_one({
                "client_id": client1_id,
                "space_type": "BATHROOM"
            })
            if bathroom_space:
                await db.sensors.update_one(
                    {"id": radars[1]["id"]},
                    {"$set": {
                        "client_id": client1_id,
                        "building_id": bathroom_space["building_id"],
                        "floor_id": bathroom_space["floor_id"],
                        "room_id": bathroom_space["room_id"],
                        "room_space_id": bathroom_space["id"]
                    }}
                )
                print(f"✅ Assigned radar 2 to bathroom")
    
    # Update existing tenant (old system) to link with new client
    await db.tenants.update_one(
        {"name": {"$regex": "Jardins", "$options": "i"}},
        {"$set": {"client_id": client1_id}}
    )
    
    print("\n🎉 Clients & Buildings seed completed!")
    print(f"   Client 1: {client1['name']} ({client1_id})")
    print(f"   Client 2: {client2['name']} ({client2_id})")


if __name__ == "__main__":
    asyncio.run(seed_clients_buildings())
