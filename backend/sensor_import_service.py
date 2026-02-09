"""
Sensor Import Service
Service for batch importing sensors/radars from CSV/Excel files
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
import csv
import io
import logging
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

logger = logging.getLogger(__name__)

# CSV Column definitions
CSV_COLUMNS = [
    "serial_number",      # Required - Numéro de série (identifiant unique)
    "name",               # Optional - Nom personnalisé
    "model",              # Optional - Modèle
    "firmware",           # Optional - Version firmware
    "organisation",       # Required - Nom de l'organisation
    "batiment",           # Required - Nom du bâtiment
    "etage",              # Required - Nom de l'étage
    "chambre",            # Required - Nom de la chambre
    "espace"              # Required - Nom de l'espace
]

CSV_TEMPLATE = """serial_number,name,model,firmware,organisation,batiment,etage,chambre,espace
VPRD-0001-0001,Radar Chambre 101,VCZ-3000,1.2.3,OHMCARE LAB,LAB,RDC,Ch 101,Lit Principal
VPRD-0001-0002,Radar Chambre 102,VCZ-3000,1.2.3,OHMCARE LAB,LAB,RDC,Ch 102,Lit 1"""


class ImportResult:
    """Result of a single import line"""
    def __init__(self, line_number: int, serial_number: str):
        self.line_number = line_number
        self.serial_number = serial_number
        self.status = "pending"  # pending, new, update, error
        self.message = ""
        self.sensor_id = None
        self.action = None  # create, update, skip
        self.location_created = []  # List of created entities
        self.data = {}

    def to_dict(self):
        return {
            "line_number": self.line_number,
            "serial_number": self.serial_number,
            "status": self.status,
            "message": self.message,
            "sensor_id": self.sensor_id,
            "action": self.action,
            "location_created": self.location_created,
            "data": self.data
        }


class ImportPreviewResponse:
    """Preview response before executing import"""
    def __init__(self):
        self.total_lines = 0
        self.new_sensors = 0
        self.updates = 0
        self.errors = 0
        self.results: List[ImportResult] = []
        self.locations_to_create = {
            "organisations": [],
            "batiments": [],
            "etages": [],
            "chambres": [],
            "espaces": []
        }

    def to_dict(self):
        return {
            "total_lines": self.total_lines,
            "new_sensors": self.new_sensors,
            "updates": self.updates,
            "errors": self.errors,
            "results": [r.to_dict() for r in self.results],
            "locations_to_create": self.locations_to_create
        }


class SensorImportService:
    """Service for importing sensors from CSV"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    def get_csv_template(self) -> str:
        """Return CSV template content"""
        return CSV_TEMPLATE
    
    def parse_csv(self, csv_content: str) -> List[Dict[str, str]]:
        """Parse CSV content and return list of dictionaries"""
        rows = []
        reader = csv.DictReader(io.StringIO(csv_content))
        
        for row in reader:
            # Normalize keys (strip whitespace, lowercase)
            normalized_row = {}
            for key, value in row.items():
                if key:
                    normalized_key = key.strip().lower()
                    normalized_row[normalized_key] = value.strip() if value else ""
            rows.append(normalized_row)
        
        return rows
    
    async def preview_import(self, csv_content: str, tenant_id: str) -> ImportPreviewResponse:
        """
        Analyze CSV and return preview of what will be imported.
        Does not modify any data.
        """
        response = ImportPreviewResponse()
        
        try:
            rows = self.parse_csv(csv_content)
        except Exception as e:
            logger.error(f"CSV parsing error: {e}")
            result = ImportResult(0, "")
            result.status = "error"
            result.message = f"Erreur de parsing CSV: {str(e)}"
            response.results.append(result)
            response.errors = 1
            return response
        
        response.total_lines = len(rows)
        
        # Track entities to create (for preview)
        orgs_to_check = set()
        buildings_to_check = {}  # org_name -> set(building_names)
        floors_to_check = {}     # (org, building) -> set(floor_names)
        rooms_to_check = {}      # (org, building, floor) -> set(room_names)
        spaces_to_check = {}     # (org, building, floor, room) -> set(space_names)
        
        for i, row in enumerate(rows, start=2):  # Start at 2 (header is line 1)
            result = ImportResult(i, row.get("serial_number", ""))
            
            # Validate required fields
            serial = row.get("serial_number", "").strip()
            organisation = row.get("organisation", "").strip()
            batiment = row.get("batiment", "").strip()
            etage = row.get("etage", "").strip()
            chambre = row.get("chambre", "").strip()
            espace = row.get("espace", "").strip()
            
            if not serial:
                result.status = "error"
                result.message = "serial_number est requis"
                response.results.append(result)
                response.errors += 1
                continue
            
            if not all([organisation, batiment, etage, chambre, espace]):
                missing = []
                if not organisation: missing.append("organisation")
                if not batiment: missing.append("batiment")
                if not etage: missing.append("etage")
                if not chambre: missing.append("chambre")
                if not espace: missing.append("espace")
                result.status = "error"
                result.message = f"Champs requis manquants: {', '.join(missing)}"
                response.results.append(result)
                response.errors += 1
                continue
            
            result.data = {
                "serial_number": serial,
                "name": row.get("name", "").strip() or f"Radar {serial}",
                "model": row.get("model", "").strip(),
                "firmware": row.get("firmware", "").strip(),
                "organisation": organisation,
                "batiment": batiment,
                "etage": etage,
                "chambre": chambre,
                "espace": espace
            }
            
            # Check if sensor exists
            existing_sensor = await self.db.sensors.find_one({
                "serial_product": serial
            }, {"_id": 0})
            
            if existing_sensor:
                result.status = "update"
                result.action = "update"
                result.sensor_id = existing_sensor.get("id")
                result.message = "Ce radar existe déjà et sera mis à jour"
                response.updates += 1
            else:
                result.status = "new"
                result.action = "create"
                result.message = "Nouveau radar à créer"
                response.new_sensors += 1
            
            # Track locations to check/create
            orgs_to_check.add(organisation)
            
            if organisation not in buildings_to_check:
                buildings_to_check[organisation] = set()
            buildings_to_check[organisation].add(batiment)
            
            key_floor = (organisation, batiment)
            if key_floor not in floors_to_check:
                floors_to_check[key_floor] = set()
            floors_to_check[key_floor].add(etage)
            
            key_room = (organisation, batiment, etage)
            if key_room not in rooms_to_check:
                rooms_to_check[key_room] = set()
            rooms_to_check[key_room].add(chambre)
            
            key_space = (organisation, batiment, etage, chambre)
            if key_space not in spaces_to_check:
                spaces_to_check[key_space] = set()
            spaces_to_check[key_space].add(espace)
            
            response.results.append(result)
        
        # Check which locations need to be created
        for org_name in orgs_to_check:
            org = await self.db.clients.find_one({"name": org_name}, {"_id": 0})
            if not org:
                response.locations_to_create["organisations"].append(org_name)
        
        for org_name, building_names in buildings_to_check.items():
            org = await self.db.clients.find_one({"name": org_name}, {"_id": 0})
            if org:
                for building_name in building_names:
                    building = await self.db.buildings.find_one({
                        "client_id": org["id"],
                        "name": building_name
                    }, {"_id": 0})
                    if not building:
                        response.locations_to_create["batiments"].append(f"{org_name} > {building_name}")
        
        for (org_name, building_name), floor_names in floors_to_check.items():
            org = await self.db.clients.find_one({"name": org_name}, {"_id": 0})
            if org:
                building = await self.db.buildings.find_one({
                    "client_id": org["id"],
                    "name": building_name
                }, {"_id": 0})
                if building:
                    for floor_name in floor_names:
                        floor = await self.db.floors.find_one({
                            "building_id": building["id"],
                            "name": floor_name
                        }, {"_id": 0})
                        if not floor:
                            response.locations_to_create["etages"].append(
                                f"{org_name} > {building_name} > {floor_name}"
                            )
        
        for (org_name, building_name, floor_name), room_names in rooms_to_check.items():
            org = await self.db.clients.find_one({"name": org_name}, {"_id": 0})
            if org:
                building = await self.db.buildings.find_one({
                    "client_id": org["id"],
                    "name": building_name
                }, {"_id": 0})
                if building:
                    floor = await self.db.floors.find_one({
                        "building_id": building["id"],
                        "name": floor_name
                    }, {"_id": 0})
                    if floor:
                        for room_name in room_names:
                            room = await self.db.rooms.find_one({
                                "floor_id": floor["id"],
                                "name": room_name
                            }, {"_id": 0})
                            if not room:
                                response.locations_to_create["chambres"].append(
                                    f"{org_name} > {building_name} > {floor_name} > {room_name}"
                                )
        
        for (org_name, building_name, floor_name, room_name), space_names in spaces_to_check.items():
            org = await self.db.clients.find_one({"name": org_name}, {"_id": 0})
            if org:
                building = await self.db.buildings.find_one({
                    "client_id": org["id"],
                    "name": building_name
                }, {"_id": 0})
                if building:
                    floor = await self.db.floors.find_one({
                        "building_id": building["id"],
                        "name": floor_name
                    }, {"_id": 0})
                    if floor:
                        room = await self.db.rooms.find_one({
                            "floor_id": floor["id"],
                            "name": room_name
                        }, {"_id": 0})
                        if room:
                            existing_spaces = room.get("spaces", [])
                            existing_space_names = {s.get("name") for s in existing_spaces}
                            for space_name in space_names:
                                if space_name not in existing_space_names:
                                    response.locations_to_create["espaces"].append(
                                        f"{org_name} > {building_name} > {floor_name} > {room_name} > {space_name}"
                                    )
        
        return response
    
    async def execute_import(self, csv_content: str, tenant_id: str) -> Dict[str, Any]:
        """
        Execute the import and create/update all sensors and locations.
        Returns summary of operations.
        """
        results = {
            "success": True,
            "created_sensors": 0,
            "updated_sensors": 0,
            "created_organisations": 0,
            "created_batiments": 0,
            "created_etages": 0,
            "created_chambres": 0,
            "created_espaces": 0,
            "errors": [],
            "details": []
        }
        
        try:
            rows = self.parse_csv(csv_content)
        except Exception as e:
            results["success"] = False
            results["errors"].append(f"Erreur de parsing CSV: {str(e)}")
            return results
        
        # Cache for created entities (to avoid duplicates)
        org_cache = {}       # name -> id
        building_cache = {}  # (org_id, name) -> id
        floor_cache = {}     # (building_id, name) -> id
        room_cache = {}      # (floor_id, name) -> id
        space_cache = {}     # (room_id, name) -> id
        
        for i, row in enumerate(rows, start=2):
            line_result = {"line": i, "status": "success", "message": ""}
            
            try:
                serial = row.get("serial_number", "").strip()
                organisation = row.get("organisation", "").strip()
                batiment = row.get("batiment", "").strip()
                etage = row.get("etage", "").strip()
                chambre = row.get("chambre", "").strip()
                espace = row.get("espace", "").strip()
                name = row.get("name", "").strip() or f"Radar {serial}"
                model = row.get("model", "").strip()
                firmware = row.get("firmware", "").strip()
                
                # Skip invalid rows
                if not serial or not all([organisation, batiment, etage, chambre, espace]):
                    line_result["status"] = "error"
                    line_result["message"] = "Champs requis manquants"
                    results["errors"].append(f"Ligne {i}: Champs requis manquants")
                    results["details"].append(line_result)
                    continue
                
                # === 1. Get or create Organisation ===
                org_id = org_cache.get(organisation)
                if not org_id:
                    org = await self.db.clients.find_one({"name": organisation}, {"_id": 0})
                    if org:
                        org_id = org["id"]
                    else:
                        # Create organisation
                        org_id = str(uuid.uuid4())
                        now = datetime.now(timezone.utc).isoformat()
                        await self.db.clients.insert_one({
                            "id": org_id,
                            "name": organisation,
                            "status": "ACTIVE",
                            "contact_email": "",
                            "contact_phone": "",
                            "address": "",
                            "created_at": now,
                            "updated_at": now
                        })
                        results["created_organisations"] += 1
                        logger.info(f"Created organisation: {organisation}")
                    org_cache[organisation] = org_id
                
                # === 2. Get or create Building ===
                building_key = (org_id, batiment)
                building_id = building_cache.get(building_key)
                if not building_id:
                    building = await self.db.buildings.find_one({
                        "client_id": org_id,
                        "name": batiment
                    }, {"_id": 0})
                    if building:
                        building_id = building["id"]
                    else:
                        building_id = str(uuid.uuid4())
                        now = datetime.now(timezone.utc).isoformat()
                        await self.db.buildings.insert_one({
                            "id": building_id,
                            "client_id": org_id,
                            "name": batiment,
                            "address": "",
                            "floors_count": 0,
                            "status": "ACTIVE",
                            "created_at": now,
                            "updated_at": now
                        })
                        results["created_batiments"] += 1
                        logger.info(f"Created building: {batiment}")
                    building_cache[building_key] = building_id
                
                # === 3. Get or create Floor ===
                floor_key = (building_id, etage)
                floor_id = floor_cache.get(floor_key)
                if not floor_id:
                    floor = await self.db.floors.find_one({
                        "building_id": building_id,
                        "name": etage
                    }, {"_id": 0})
                    if floor:
                        floor_id = floor["id"]
                    else:
                        floor_id = str(uuid.uuid4())
                        now = datetime.now(timezone.utc).isoformat()
                        await self.db.floors.insert_one({
                            "id": floor_id,
                            "building_id": building_id,
                            "client_id": org_id,
                            "name": etage,
                            "level": 0,
                            "status": "ACTIVE",
                            "created_at": now,
                            "updated_at": now
                        })
                        results["created_etages"] += 1
                        logger.info(f"Created floor: {etage}")
                    floor_cache[floor_key] = floor_id
                
                # === 4. Get or create Room ===
                room_key = (floor_id, chambre)
                room_id = room_cache.get(room_key)
                if not room_id:
                    room = await self.db.rooms.find_one({
                        "floor_id": floor_id,
                        "name": chambre
                    }, {"_id": 0})
                    if room:
                        room_id = room["id"]
                    else:
                        room_id = str(uuid.uuid4())
                        now = datetime.now(timezone.utc).isoformat()
                        await self.db.rooms.insert_one({
                            "id": room_id,
                            "floor_id": floor_id,
                            "building_id": building_id,
                            "client_id": org_id,
                            "name": chambre,
                            "room_type": "BEDROOM",
                            "status": "ACTIVE",
                            "spaces": [],
                            "created_at": now,
                            "updated_at": now
                        })
                        results["created_chambres"] += 1
                        logger.info(f"Created room: {chambre}")
                    room_cache[room_key] = room_id
                
                # === 5. Get or create Space ===
                space_key = (room_id, espace)
                space_id = space_cache.get(space_key)
                if not space_id:
                    room_doc = await self.db.rooms.find_one({"id": room_id}, {"_id": 0})
                    existing_spaces = room_doc.get("spaces", []) if room_doc else []
                    existing_space = next((s for s in existing_spaces if s.get("name") == espace), None)
                    
                    if existing_space:
                        space_id = existing_space["id"]
                    else:
                        space_id = str(uuid.uuid4())
                        now = datetime.now(timezone.utc).isoformat()
                        new_space = {
                            "id": space_id,
                            "name": espace,
                            "space_type": "BED",
                            "status": "ACTIVE",
                            "radar_id": None,
                            "created_at": now
                        }
                        await self.db.rooms.update_one(
                            {"id": room_id},
                            {"$push": {"spaces": new_space}}
                        )
                        results["created_espaces"] += 1
                        logger.info(f"Created space: {espace}")
                    space_cache[space_key] = space_id
                
                # === 6. Create or update Sensor ===
                existing_sensor = await self.db.sensors.find_one({
                    "serial_product": serial
                }, {"_id": 0})
                
                if existing_sensor:
                    # Update existing sensor
                    update_data = {
                        "name": name,
                        "client_id": org_id,
                        "building_id": building_id,
                        "floor_id": floor_id,
                        "room_id": room_id,
                        "room_space_id": space_id,
                        "assignment_status": "ASSIGNED"
                    }
                    if model:
                        update_data["model"] = model
                    if firmware:
                        update_data["firmware"] = firmware
                    
                    await self.db.sensors.update_one(
                        {"serial_product": serial},
                        {"$set": update_data}
                    )
                    
                    # Update space with radar_id
                    await self.db.rooms.update_one(
                        {"id": room_id, "spaces.id": space_id},
                        {"$set": {"spaces.$.radar_id": existing_sensor["id"]}}
                    )
                    
                    results["updated_sensors"] += 1
                    line_result["message"] = f"Radar {serial} mis à jour"
                    logger.info(f"Updated sensor: {serial}")
                else:
                    # Create new sensor
                    sensor_id = str(uuid.uuid4())
                    now = datetime.now(timezone.utc).isoformat()
                    
                    new_sensor = {
                        "id": sensor_id,
                        "name": name,
                        "type": "RADAR",
                        "serial_product": serial,
                        "device_id": serial,  # Use serial as device_id initially
                        "model": model or "Vayyar",
                        "firmware": firmware,
                        "tenant_id": tenant_id,
                        "client_id": org_id,
                        "building_id": building_id,
                        "floor_id": floor_id,
                        "room_id": room_id,
                        "room_space_id": space_id,
                        "assignment_status": "ASSIGNED",
                        "status": "OFFLINE",
                        "api_key": f"sk_{uuid.uuid4().hex}",
                        "created_at": now,
                        "last_seen": None
                    }
                    
                    await self.db.sensors.insert_one(new_sensor)
                    
                    # Update space with radar_id
                    await self.db.rooms.update_one(
                        {"id": room_id, "spaces.id": space_id},
                        {"$set": {"spaces.$.radar_id": sensor_id}}
                    )
                    
                    results["created_sensors"] += 1
                    line_result["message"] = f"Radar {serial} créé"
                    logger.info(f"Created sensor: {serial}")
                
            except Exception as e:
                line_result["status"] = "error"
                line_result["message"] = str(e)
                results["errors"].append(f"Ligne {i}: {str(e)}")
                logger.error(f"Error importing line {i}: {e}")
            
            results["details"].append(line_result)
        
        if results["errors"]:
            results["success"] = len(results["errors"]) < len(rows)
        
        return results


# Global service instance
sensor_import_service: Optional[SensorImportService] = None


def init_sensor_import_service(db: AsyncIOMotorDatabase) -> SensorImportService:
    """Initialize the sensor import service"""
    global sensor_import_service
    sensor_import_service = SensorImportService(db)
    return sensor_import_service


def get_sensor_import_service() -> SensorImportService:
    """Get the sensor import service instance"""
    if sensor_import_service is None:
        raise RuntimeError("SensorImportService not initialized")
    return sensor_import_service
