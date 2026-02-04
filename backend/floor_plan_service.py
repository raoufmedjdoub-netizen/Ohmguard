"""
Floor Plan Service
Gestion des plans d'étage avec upload d'images et PDF
"""
import os
import uuid
import fitz  # PyMuPDF
from PIL import Image
from io import BytesIO
from datetime import datetime, timezone
from typing import Optional
from fastapi import UploadFile, HTTPException

# Directory for storing floor plans
UPLOAD_DIR = "/app/uploads/floor_plans"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.pdf'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class FloorPlanService:
    def __init__(self, db):
        self.db = db
    
    async def upload_floor_plan(
        self, 
        floor_id: str, 
        file: UploadFile,
        uploaded_by: str
    ) -> dict:
        """Upload a floor plan image or PDF for a floor"""
        
        # Validate floor exists
        floor = await self.db.floors.find_one({"id": floor_id}, {"_id": 0})
        if not floor:
            raise HTTPException(status_code=404, detail="Étage non trouvé")
        
        # Validate file extension
        filename = file.filename.lower()
        ext = os.path.splitext(filename)[1]
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"Type de fichier non supporté. Formats acceptés: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 MB)")
        
        # Convert PDF to image if needed
        if ext == '.pdf':
            try:
                content = self._convert_pdf_to_image(content)
                ext = '.png'
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Erreur de conversion PDF: {str(e)}")
        
        # Optimize image
        try:
            content = self._optimize_image(content)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erreur de traitement image: {str(e)}")
        
        # Generate unique filename
        plan_id = str(uuid.uuid4())
        stored_filename = f"{plan_id}.png"
        file_path = os.path.join(UPLOAD_DIR, stored_filename)
        
        # Delete existing plan if any
        existing = await self.db.floor_plans.find_one({"floor_id": floor_id})
        if existing and existing.get("filename"):
            old_path = os.path.join(UPLOAD_DIR, existing["filename"])
            if os.path.exists(old_path):
                os.remove(old_path)
        
        # Save file
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # Save metadata to database
        plan_doc = {
            "id": plan_id,
            "floor_id": floor_id,
            "building_id": floor.get("building_id"),
            "client_id": floor.get("client_id"),
            "filename": stored_filename,
            "original_filename": file.filename,
            "content_type": "image/png",
            "size_bytes": len(content),
            "uploaded_by": uploaded_by,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "markers": []  # For future Phase 2: sensor positions
        }
        
        # Upsert
        await self.db.floor_plans.update_one(
            {"floor_id": floor_id},
            {"$set": plan_doc},
            upsert=True
        )
        
        return {
            "id": plan_id,
            "floor_id": floor_id,
            "filename": stored_filename,
            "message": "Plan uploadé avec succès"
        }
    
    def _convert_pdf_to_image(self, pdf_bytes: bytes) -> bytes:
        """Convert first page of PDF to PNG image"""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc.load_page(0)  # First page
        
        # Render at 2x resolution for better quality
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        
        img_bytes = pix.tobytes("png")
        doc.close()
        
        return img_bytes
    
    def _optimize_image(self, image_bytes: bytes, max_dimension: int = 2000) -> bytes:
        """Optimize image: resize if too large, convert to PNG"""
        img = Image.open(BytesIO(image_bytes))
        
        # Convert to RGB if necessary (handles RGBA, palette, etc.)
        if img.mode in ('RGBA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                background.paste(img, mask=img.split()[3])
            else:
                background.paste(img)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if too large
        if max(img.size) > max_dimension:
            ratio = max_dimension / max(img.size)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Save as PNG
        output = BytesIO()
        img.save(output, format='PNG', optimize=True)
        return output.getvalue()
    
    async def get_floor_plan(self, floor_id: str) -> Optional[dict]:
        """Get floor plan metadata"""
        plan = await self.db.floor_plans.find_one({"floor_id": floor_id}, {"_id": 0})
        return plan
    
    async def get_floor_plan_image_path(self, floor_id: str) -> Optional[str]:
        """Get the file path for a floor plan image"""
        plan = await self.db.floor_plans.find_one({"floor_id": floor_id}, {"_id": 0})
        if plan and plan.get("filename"):
            path = os.path.join(UPLOAD_DIR, plan["filename"])
            if os.path.exists(path):
                return path
        return None
    
    async def delete_floor_plan(self, floor_id: str) -> bool:
        """Delete a floor plan"""
        plan = await self.db.floor_plans.find_one({"floor_id": floor_id})
        if not plan:
            return False
        
        # Delete file
        if plan.get("filename"):
            file_path = os.path.join(UPLOAD_DIR, plan["filename"])
            if os.path.exists(file_path):
                os.remove(file_path)
        
        # Delete from database
        result = await self.db.floor_plans.delete_one({"floor_id": floor_id})
        return result.deleted_count > 0
    
    async def list_floor_plans(self, building_id: str) -> list:
        """List all floor plans for a building"""
        plans = await self.db.floor_plans.find(
            {"building_id": building_id}, 
            {"_id": 0}
        ).to_list(100)
        return plans


# Singleton instance
_floor_plan_service = None

def get_floor_plan_service(db) -> FloorPlanService:
    global _floor_plan_service
    if _floor_plan_service is None:
        _floor_plan_service = FloorPlanService(db)
    return _floor_plan_service
