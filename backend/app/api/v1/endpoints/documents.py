import os
import re
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from app.core.config import settings
from app.core.auth import get_current_user, AuthenticatedUser
from app.services.supabase_db import SupabaseDBService
from app.models.schemas import ChatQueryRequest, DocumentResponse, SessionAssignRequest, ChatMessageResponse
from app.services.document_processor import DocumentProcessor
from app.services.pinecone_store import pinecone_store as vector_store
from app.services.rag_service import rag_service
from pydantic import BaseModel

router = APIRouter()

class DocumentRenameRequest(BaseModel):
    filename: str

def format_doc_response(doc: dict) -> dict:
    meta = doc.get("metadata") or {}
    return {
        "id": doc.get("id"),
        "session_id": doc.get("session_id"),
        "workspace_id": "default",
        "filename": doc.get("filename"),
        "file_type": doc.get("file_type"),
        "file_size": meta.get("file_size", 0),
        "status": doc.get("status", "pending"),
        "page_count": meta.get("page_count", 0),
        "summary": meta.get("summary"),
        "keywords": meta.get("keywords") or [],
        "timeline": meta.get("timeline") or [],
        "entities": meta.get("entities") or [],
        "metadata": meta,
        "created_at": doc.get("created_at")
    }

async def process_document_background(doc_id: str, file_path: str, file_type: str, session_id: str, filename: str, file_size: int):
    print(f"[INFO] Starting background processing for {filename} ({doc_id})")
    try:
        SupabaseDBService.update_document(doc_id, status="processing")
        
        print(f"[INFO] Extracting text for {filename}")
        pages, chunks = DocumentProcessor.extract_text_and_chunks(file_path, file_type)
        
        print(f"[INFO] Adding {len(chunks)} chunks to vector store for {filename}")
        try:
            vector_store.add_document_chunks("default", doc_id, filename, chunks)
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
        
        updated_metadata = {
            "file_size": file_size,
            "file_path": file_path,
            "page_count": max(1, len(pages)),
            "summary": insights.get("summary") or f"Document {filename} processed.",
            "keywords": insights.get("keywords") or [file_type.upper()],
            "timeline": insights.get("timeline") or [],
            "entities": insights.get("entities") or []
        }
        
        SupabaseDBService.update_document(
            doc_id=doc_id,
            status="completed",
            metadata=updated_metadata
        )
        print(f"[INFO] Processing successfully completed for {filename}")
    except Exception as e:
        print(f"[ERROR] Processing failed for {filename}: {str(e)}")
        try:
            SupabaseDBService.update_document(
                doc_id=doc_id,
                status=f"failed: {str(e)}"
            )
        except Exception as commit_err:
            print(f"[ERROR] Failed to save failure status: {commit_err}")

@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    workspace_id: str = Form("default"),
    session_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    doc_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "txt"
    file_path = os.path.join(settings.DOCS_DIR, f"{doc_id}.{ext}")
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    doc = SupabaseDBService.create_document(
        session_id=session_id,
        user_id=current_user.id,
        filename=file.filename,
        file_type=ext,
        file_size=len(content),
        doc_id=doc_id,
        file_path=file_path
    )

    background_tasks.add_task(
        process_document_background,
        doc_id,
        file_path,
        ext,
        session_id,
        file.filename,
        len(content)
    )

    return {
        "message": "Upload started",
        "doc": format_doc_response(doc)
    }

@router.post("/{doc_id}/retry")
async def retry_document_processing(
    doc_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    doc = SupabaseDBService.get_document(doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    meta = doc.get("metadata") or {}
    ext = doc.get("file_type") or "txt"
    file_path = meta.get("file_path") or os.path.join(settings.DOCS_DIR, f"{doc_id}.{ext}")
    
    SupabaseDBService.update_document(doc_id, status="pending")

    background_tasks.add_task(
        process_document_background,
        doc["id"],
        file_path,
        doc["file_type"],
        doc["session_id"],
        doc["filename"],
        meta.get("file_size", 0)
    )
    return {"message": "Document re-processing started", "status": "pending"}

@router.patch("/{doc_id}/rename", response_model=DocumentResponse)
async def rename_document(
    doc_id: str,
    payload: DocumentRenameRequest,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    doc = SupabaseDBService.get_document(doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if payload.filename.strip():
        updated = SupabaseDBService.update_document(doc_id, filename=payload.filename.strip())
        return format_doc_response(updated or doc)
    return format_doc_response(doc)

@router.get("/workspace/{workspace_id}", response_model=list[DocumentResponse])
async def list_workspace_documents(
    workspace_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    # Retrieve all documents across the user's sessions
    try:
        sessions = SupabaseDBService.list_sessions(user_id=current_user.id)
        all_docs = []
        for s in sessions:
            docs = SupabaseDBService.list_session_documents(session_id=s["id"], user_id=current_user.id)
            all_docs.extend([format_doc_response(d) for d in docs])
        return all_docs
    except Exception as e:
        print(f"[ERROR] list_workspace_documents failed: {e}")
        return []

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    doc = SupabaseDBService.get_document(doc_id, user_id=current_user.id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        vector_store.delete_document_chunks(doc_id)
    except Exception as e:
        print(f"[WARN] Error deleting vector chunks for {doc_id}: {e}")

    try:
        meta = doc.get("metadata") or {}
        ext = doc.get("file_type") or "txt"
        file_path = meta.get("file_path") or os.path.join(settings.DOCS_DIR, f"{doc_id}.{ext}")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"[WARN] Error removing file: {e}")

    SupabaseDBService.delete_document(doc_id, user_id=current_user.id)
    return {"message": "Document deleted"}

@router.post("/query")
async def workspace_query(
    payload: ChatQueryRequest,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    # Verify session ownership
    session = SupabaseDBService.get_session(payload.session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or unauthorized")

    query_text = payload.query.strip()
    query_lower = query_text.lower()
    
    # 1. Gather all documents in this session
    session_docs = SupabaseDBService.list_session_documents(session_id=payload.session_id, user_id=current_user.id)
    
    scoped_docs = session_docs
    if payload.doc_ids:
        scoped_docs = [d for d in session_docs if d["id"] in payload.doc_ids]
    
    # 2. Check for explicit filename targeting in user query
    targeted_docs = []
    for doc in scoped_docs:
        fname = doc["filename"].lower()
        base_name = os.path.splitext(fname)[0]
        if fname in query_lower or (len(base_name) > 2 and base_name in query_lower):
            targeted_docs.append(doc)
            
    snippets = []
    seen_snippet_keys = set()
    
    for doc in targeted_docs:
        meta = doc.get("metadata") or {}
        ext = doc.get("file_type") or "txt"
        file_path = meta.get("file_path") or os.path.join(settings.DOCS_DIR, f"{doc['id']}.{ext}")
        if os.path.exists(file_path):
            try:
                pages, chunks = DocumentProcessor.extract_text_and_chunks(file_path, doc["file_type"])
                for p in pages[:6]:
                    key = f"{doc['filename']}_{p['page']}"
                    if key not in seen_snippet_keys:
                        seen_snippet_keys.add(key)
                        snippets.append(f"[{doc['filename']} - Page {p['page']}]: {p['text'][:800].replace(chr(10), ' ')}")
            except Exception as e:
                print(f"[WARN] Direct extraction for targeted doc {doc['filename']} failed: {e}")

    # 3. Query vector store scoped to session document IDs
    vector_doc_ids = [d["id"] for d in scoped_docs] if scoped_docs else None
    documents = []
    metadatas = []
    if vector_doc_ids:
        initial_results = vector_store.query(
            workspace_id="default",
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
            meta = doc.get("metadata") or {}
            ext = doc.get("file_type") or "txt"
            file_path = meta.get("file_path") or os.path.join(settings.DOCS_DIR, f"{doc['id']}.{ext}")
            if os.path.exists(file_path):
                try:
                    pages, _ = DocumentProcessor.extract_text_and_chunks(file_path, doc["file_type"])
                    for p in pages[:3]:
                        snippets.append(f"[{doc['filename']} - Page {p['page']}]: {p['text'][:600].replace(chr(10), ' ')}")
                except Exception:
                    pass

    answer = rag_service.generate_query_answer(payload.query, snippets)
    
    # 5. Extract citations
    citations = []
    for meta in metadatas[:4]:
        if isinstance(meta, dict) and "filename" in meta:
            citations.append({"doc_id": meta.get("doc_id"), "filename": meta.get("filename")})
    for doc in targeted_docs:
        if not any(c.get("filename") == doc["filename"] for c in citations):
            citations.append({"doc_id": doc["id"], "filename": doc["filename"]})

    # 6. Persist user and assistant messages in Supabase
    SupabaseDBService.create_message(
        session_id=payload.session_id,
        user_id=current_user.id,
        role="user",
        content=payload.query
    )
    SupabaseDBService.create_message(
        session_id=payload.session_id,
        user_id=current_user.id,
        role="assistant",
        content=answer,
        sources=citations
    )

    return {"answer": answer, "results": {"documents": documents, "metadatas": metadatas}}

@router.get("/session/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_session_messages(
    session_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    try:
        messages = SupabaseDBService.list_session_messages(session_id=session_id, user_id=current_user.id)
        return [
            {
                "id": m["id"],
                "session_id": m["session_id"],
                "role": m["role"],
                "content": m["content"],
                "sources": m.get("sources") or [],
                "citations": m.get("sources") or [],
                "created_at": m.get("created_at"),
                "timestamp": m.get("created_at")
            }
            for m in messages
        ]
    except Exception as e:
        print(f"[ERROR] list_session_messages failed: {e}")
        return []

@router.get("/session/{session_id}/documents", response_model=list[DocumentResponse])
async def list_session_documents(
    session_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    try:
        docs = SupabaseDBService.list_session_documents(session_id=session_id, user_id=current_user.id)
        return [format_doc_response(d) for d in docs]
    except Exception as e:
        print(f"[ERROR] list_session_documents failed: {e}")
        return []
