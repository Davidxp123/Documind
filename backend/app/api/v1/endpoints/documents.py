import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.models.db_models import Document, Workspace
from app.models.schemas import ChatQueryRequest, DocumentResponse
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import vector_store
from app.services.gemini_service import gemini_service

router = APIRouter()

async def process_document_background(doc_id: str, file_path: str, file_type: str, workspace_id: str, filename: str):
    async for db in get_db():
        doc = await db.get(Document, doc_id)
        if not doc:
            return
        
        doc.status = "processing"
        await db.commit()
        
        try:
            pages, chunks = DocumentProcessor.extract_text_and_chunks(file_path, file_type)
            vector_store.add_document_chunks(workspace_id, doc_id, filename, chunks)
            
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
        
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        workspace = Workspace(id=workspace_id, name="Demo Workspace")
        db.add(workspace)
        await db.commit()

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
    
    background_tasks.add_task(process_document_background, doc_id, file_path, ext, workspace_id, file.filename)
    
    return {"message": "Upload started", "doc_id": doc_id}

@router.get("/workspace/{workspace_id}", response_model=list[DocumentResponse])
async def list_workspace_documents(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.workspace_id == workspace_id))
    return result.scalars().all()

@router.post("/query")
async def workspace_query(payload: ChatQueryRequest):
    results = vector_store.query(payload.workspace_id, payload.query, top_k=6)
    documents = results.get("documents") or []
    metadatas = results.get("metadatas") or []

    if documents and isinstance(documents[0], list):
        documents = documents[0]
    if metadatas and isinstance(metadatas[0], list):
        metadatas = metadatas[0]

    snippets = []
    for idx, text in enumerate(documents[:6]):
        text_value = text if isinstance(text, str) else str(text)
        meta = metadatas[idx] if idx < len(metadatas) else {}
        page = meta.get("page", "?")
        snippets.append(f"Page {page}: {text_value[:400].replace('\n', ' ')}")

    answer = gemini_service.generate_query_answer(payload.query, snippets)

    return {"answer": answer, "results": {"documents": documents, "metadatas": metadatas}}

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        vector_store.delete_document_chunks(doc_id)
    except Exception:
        pass

    try:
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except Exception:
        pass

    await db.delete(doc)
    await db.commit()

    return {"message": "Document deleted"}
