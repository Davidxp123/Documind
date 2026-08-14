import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.models.db_models import Document, Workspace, Session, ChatMessage
from app.models.schemas import ChatQueryRequest, DocumentResponse, SessionAssignRequest, ChatMessageResponse
from app.services.document_processor import DocumentProcessor
from app.services.pinecone_store import pinecone_store as vector_store
from app.services.rag_service import rag_service

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
            insights = rag_service.generate_document_insights(full_text)
            
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
    session_id: str | None = Form(None),
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

    if session_id:
        session_obj = await db.get(Session, session_id)
        if not session_obj:
            raise HTTPException(status_code=404, detail="Session not found")

    doc = Document(
        id=doc_id,
        workspace_id=workspace_id,
        session_id=session_id,
        filename=file.filename,
        file_type=ext,
        file_path=file_path,
        file_size=len(content),
        status="pending"
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(process_document_background, doc_id, file_path, ext, workspace_id, file.filename)

    return {
        "message": "Upload started",
        "doc": {
            "id": doc.id,
            "workspace_id": doc.workspace_id,
            "session_id": doc.session_id,
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_size": doc.file_size,
            "status": doc.status,
            "page_count": doc.page_count,
            "summary": doc.summary,
            "keywords": doc.keywords,
            "timeline": doc.timeline,
            "entities": doc.entities,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
    }

@router.get("/workspace/{workspace_id}", response_model=list[DocumentResponse])
async def list_workspace_documents(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.workspace_id == workspace_id))
    return result.scalars().all()

@router.patch("/{doc_id}/session", response_model=DocumentResponse)
async def assign_document_session(doc_id: str, payload: SessionAssignRequest, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if payload.session_id:
        session_obj = await db.get(Session, payload.session_id)
        if not session_obj:
            raise HTTPException(status_code=404, detail="Session not found")

    doc.session_id = payload.session_id
    await db.commit()
    await db.refresh(doc)
    return doc

@router.post("/query")
async def workspace_query(payload: ChatQueryRequest, db: AsyncSession = Depends(get_db)):
    initial_results = vector_store.query(
        workspace_id=payload.workspace_id,
        query_text=payload.query,
        top_k=6,
        doc_ids=payload.doc_ids if payload.doc_ids else None
    )
    initial_documents = initial_results.get("documents") or []
    initial_metadatas = initial_results.get("metadatas") or []

    documents = list(initial_documents)
    metadatas = list(initial_metadatas)

    if documents and isinstance(documents[0], list):
        documents = documents[0]
    if metadatas and isinstance(metadatas[0], list):
        metadatas = metadatas[0]

    snippets = []
    for idx, text in enumerate(documents[:6]):
        text_value = text if isinstance(text, str) else str(text)
        meta = metadatas[idx] if idx < len(metadatas) else {}
        page = meta.get("page", "?")
        doc_filename = meta.get("filename", "Document")
        snippets.append(f"[{doc_filename} - Page {page}]: {text_value[:500].replace('\n', ' ')}")

    if not snippets and payload.doc_ids:
        q = await db.execute(select(Document).where(Document.id.in_(payload.doc_ids)))
        found_docs = q.scalars().all()
        if any((d.status != "completed") for d in found_docs):
            return {"answer": "Requested documents are still processing. Please wait a few seconds and try again.", "results": {"documents": [], "metadatas": []}}
        
        # Fallback: extract text directly from document files if vector DB returned empty
        for doc in found_docs:
            if doc.file_path and os.path.exists(doc.file_path):
                try:
                    pages, _ = DocumentProcessor.extract_text_and_chunks(doc.file_path, doc.file_type)
                    for p in pages[:3]:
                        snippets.append(f"[{doc.filename} - Page {p['page']}]: {p['text'][:500].replace('\n', ' ')}")
                except Exception:
                    pass

    answer = rag_service.generate_query_answer(payload.query, snippets)
    
    # Persist chat messages
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        session_id=payload.session_id,
        role="user",
        content=payload.query
    )
    db.add(user_msg)
    
    assistant_msg = ChatMessage(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        session_id=payload.session_id,
        role="assistant",
        content=answer,
        citations=[{"doc_id": meta.get("doc_id"), "filename": meta.get("filename")} for meta in metadatas[:3]] # Simple citation extraction
    )
    db.add(assistant_msg)
    await db.commit()

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

@router.get("/session/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_session_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp.asc()))
    return result.scalars().all()

@router.get("/session/{session_id}/documents", response_model=list[DocumentResponse])
async def list_session_documents(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.session_id == session_id))
    return result.scalars().all()
