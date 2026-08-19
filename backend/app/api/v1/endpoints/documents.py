import os
import re
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
from pydantic import BaseModel

router = APIRouter()

class DocumentRenameRequest(BaseModel):
    filename: str

async def process_document_background(doc_id: str, file_path: str, file_type: str, workspace_id: str, filename: str):
    print(f"[INFO] Starting background processing for {filename} ({doc_id})")
    async for db in get_db():
        try:
            doc = await db.get(Document, doc_id)
            if not doc:
                print(f"[ERROR] Document {doc_id} not found in DB")
                return
            
            doc.status = "processing"
            await db.commit()
            
            print(f"[INFO] Extracting text for {filename}")
            pages, chunks = DocumentProcessor.extract_text_and_chunks(file_path, file_type)
            
            print(f"[INFO] Adding {len(chunks)} chunks to vector store for {filename}")
            try:
                vector_store.add_document_chunks(workspace_id, doc_id, filename, chunks)
            except Exception as v_err:
                print(f"[WARN] Vector store indexing warning for {filename}: {v_err}")
            
            full_text = "\n".join([p["text"] for p in pages])
            print(f"[INFO] Generating insights for {filename}")
            try:
                insights = rag_service.generate_document_insights(full_text)
            except Exception as ins_err:
                print(f"[WARN] Insights generation fallback for {filename}: {ins_err}")
                insights = {
                    "summary": f"Document {filename} processed successfully with {len(pages)} pages/sheets/slides.",
                    "keywords": [file_type.upper(), "Document", filename.split(".")[0]],
                    "timeline": [],
                    "entities": []
                }
            
            doc.status = "completed"
            doc.page_count = max(1, len(pages))
            doc.summary = insights.get("summary") or f"Document {filename} processed."
            doc.keywords = insights.get("keywords") or [file_type.upper()]
            doc.timeline = insights.get("timeline") or []
            doc.entities = insights.get("entities") or []
            await db.commit()
            print(f"[INFO] Processing successfully completed for {filename}")
        except Exception as e:
            print(f"[ERROR] Processing failed for {filename}: {str(e)}")
            try:
                doc = await db.get(Document, doc_id)
                if doc:
                    doc.status = f"failed: {str(e)}"
                    await db.commit()
            except Exception as commit_err:
                print(f"[ERROR] Failed to save failure status: {commit_err}")
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
            # Fallback create session if referenced
            session_obj = Session(id=session_id, workspace_id=workspace_id, name="Session 1")
            db.add(session_obj)
            await db.commit()

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

@router.post("/{doc_id}/retry")
async def retry_document_processing(
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc.status = "pending"
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(
        process_document_background,
        doc.id,
        doc.file_path,
        doc.file_type,
        doc.workspace_id,
        doc.filename
    )
    return {"message": "Document re-processing started", "status": "pending"}

@router.patch("/{doc_id}/rename", response_model=DocumentResponse)
async def rename_document(doc_id: str, payload: DocumentRenameRequest, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if payload.filename.strip():
        doc.filename = payload.filename.strip()
        await db.commit()
        await db.refresh(doc)
    return doc

@router.get("/workspace/{workspace_id}", response_model=list[DocumentResponse])
async def list_workspace_documents(workspace_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Document).where(Document.workspace_id == workspace_id))
        return result.scalars().all()
    except Exception as e:
        print(f"[ERROR] list_workspace_documents failed: {e}")
        return []

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
    query_text = payload.query.strip()
    query_lower = query_text.lower()
    
    # 1. Gather all documents candidate in this workspace / session
    q_docs = await db.execute(
        select(Document).where(Document.workspace_id == payload.workspace_id)
    )
    all_workspace_docs = q_docs.scalars().all()
    
    # Scope to session if doc_ids or session_id specified
    scoped_docs = all_workspace_docs
    if payload.doc_ids:
        scoped_docs = [d for d in all_workspace_docs if d.id in payload.doc_ids]
    elif payload.session_id:
        scoped_docs = [d for d in all_workspace_docs if d.session_id == payload.session_id]
        if not scoped_docs:
            scoped_docs = all_workspace_docs

    # Check if any documents are still in 'pending' or 'processing'
    processing_docs = [d for d in scoped_docs if d.status in ["pending", "processing"]]
    
    # 2. Check for explicit filename targeting in user query
    targeted_docs = []
    for doc in scoped_docs:
        fname = doc.filename.lower()
        base_name = os.path.splitext(fname)[0]
        # Match exact filename or base name mention
        if fname in query_lower or (len(base_name) > 2 and base_name in query_lower):
            targeted_docs.append(doc)
            
    snippets = []
    seen_snippet_keys = set()
    
    # If targeted docs found, directly load high-priority context from them
    for doc in targeted_docs:
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                pages, chunks = DocumentProcessor.extract_text_and_chunks(doc.file_path, doc.file_type)
                for p in pages[:6]:
                    key = f"{doc.filename}_{p['page']}"
                    if key not in seen_snippet_keys:
                        seen_snippet_keys.add(key)
                        snippets.append(f"[{doc.filename} - Page {p['page']}]: {p['text'][:800].replace(chr(10), ' ')}")
            except Exception as e:
                print(f"[WARN] Direct extraction for targeted doc {doc.filename} failed: {e}")

    # 3. Query vector store
    vector_doc_ids = [d.id for d in scoped_docs] if scoped_docs else None
    initial_results = vector_store.query(
        workspace_id=payload.workspace_id,
        query_text=payload.query,
        top_k=8,
        doc_ids=vector_doc_ids
    )
    initial_documents = initial_results.get("documents") or []
    initial_metadatas = initial_results.get("metadatas") or []

    documents = list(initial_documents)
    metadatas = list(initial_metadatas)

    if documents and isinstance(documents[0], list):
        documents = documents[0]
    if metadatas and isinstance(metadatas[0], list):
        metadatas = metadatas[0]

    for idx, text in enumerate(documents[:8]):
        text_value = text if isinstance(text, str) else str(text)
        meta = metadatas[idx] if idx < len(metadatas) else {}
        page = meta.get("page", "?")
        doc_filename = meta.get("filename", "Document")
        key = f"{doc_filename}_{page}_{text_value[:40]}"
        if key not in seen_snippet_keys:
            seen_snippet_keys.add(key)
            snippets.append(f"[{doc_filename} - Page {page}]: {text_value[:600].replace(chr(10), ' ')}")

    # 4. Direct file fallback if still empty but scoped documents exist
    if not snippets and scoped_docs:
        for doc in scoped_docs[:4]:
            if doc.file_path and os.path.exists(doc.file_path):
                try:
                    pages, _ = DocumentProcessor.extract_text_and_chunks(doc.file_path, doc.file_type)
                    for p in pages[:3]:
                        snippets.append(f"[{doc.filename} - Page {p['page']}]: {p['text'][:600].replace(chr(10), ' ')}")
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
    
    # Extract citations
    citations = []
    for meta in metadatas[:4]:
        if isinstance(meta, dict) and "filename" in meta:
            citations.append({"doc_id": meta.get("doc_id"), "filename": meta.get("filename")})
    for doc in targeted_docs:
        if not any(c.get("filename") == doc.filename for c in citations):
            citations.append({"doc_id": doc.id, "filename": doc.filename})

    assistant_msg = ChatMessage(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        session_id=payload.session_id,
        role="assistant",
        content=answer,
        citations=citations
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
    except Exception as e:
        print(f"[WARN] Error deleting vector chunks for {doc_id}: {e}")

    try:
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except Exception as e:
        print(f"[WARN] Error removing file {doc.file_path}: {e}")

    await db.delete(doc)
    await db.commit()

    return {"message": "Document deleted"}

@router.get("/session/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_session_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp.asc()))
        return result.scalars().all()
    except Exception as e:
        print(f"[ERROR] list_session_messages failed: {e}")
        return []

@router.get("/session/{session_id}/documents", response_model=list[DocumentResponse])
async def list_session_documents(session_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Document).where(Document.session_id == session_id))
        return result.scalars().all()
    except Exception as e:
        print(f"[ERROR] list_session_documents failed: {e}")
        return []
