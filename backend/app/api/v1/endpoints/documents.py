import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.models.db_models import Document
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import vector_store
from app.services.gemini_service import gemini_service

router = APIRouter()

async def process_document_background(doc_id: str, file_path: str, file_type: str, workspace_id: str):
    async for db in get_db():
        doc = await db.get(Document, doc_id)
        if not doc:
            return
        
        doc.status = "processing"
        await db.commit()
        
        try:
            pages, chunks = DocumentProcessor.extract_text_and_chunks(file_path, file_type)
            vector_store.add_document_chunks(workspace_id, doc_id, chunks)
            
            full_text = "\n".join([p["text"] for p in pages])
            insights = gemini_service.generate_document_insights(full_text)
            
            doc.status = "completed"
            doc.page_count = len(pages)
            doc.summary = insights.get("summary")
            doc.keywords = insights.get("keywords")
            doc.timeline = insights.get("timeline")
            doc.entities = insights.get("entities")
            await db.commit()
        except Exception as e:
            doc.status = f"failed: {str(e)}"
            await db.commit()
        break

@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    workspace_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    doc_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "txt"
    file_path = os.path.join(settings.DOCS_DIR, f"{doc_id}.{ext}")
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    doc = Document(
        id=doc_id,
        workspace_id=workspace_id,
        filename=file.filename,
        file_type=ext,
        file_path=file_path,
        file_size=len(content),
        status="pending"
    )
    db.add(doc)
    await db.commit()
    
    background_tasks.add_task(process_document_background, doc_id, file_path, ext, workspace_id)
    
    return {"message": "Upload started", "doc_id": doc_id}
