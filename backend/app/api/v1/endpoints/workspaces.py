import uuid
import os
from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import get_current_user, AuthenticatedUser
from app.services.supabase_db import SupabaseDBService
from app.models.schemas import (
    WorkspaceCreate, WorkspaceResponse,
    SessionCreate, SessionResponse
)
from app.services.pinecone_store import pinecone_store as vector_store

router = APIRouter()

@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(payload: WorkspaceCreate, current_user: AuthenticatedUser = Depends(get_current_user)):
    return {
        "id": "default",
        "name": payload.name or "Default Workspace",
        "description": payload.description
    }

@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(current_user: AuthenticatedUser = Depends(get_current_user)):
    return [{
        "id": "default",
        "name": "Default Workspace",
        "description": None
    }]

@router.post("/{workspace_id}/sessions", response_model=SessionResponse)
async def create_workspace_session(
    workspace_id: str,
    payload: SessionCreate,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    try:
        session = SupabaseDBService.create_session(
            user_id=current_user.id,
            name=payload.name
        )
        return session
    except Exception as e:
        print(f"[ERROR] create_workspace_session failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")

@router.get("/{workspace_id}/sessions", response_model=list[SessionResponse])
async def list_workspace_sessions(
    workspace_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    try:
        sessions = SupabaseDBService.list_sessions(user_id=current_user.id)
        return sessions
    except Exception as e:
        print(f"[ERROR] list_workspace_sessions failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch sessions: {str(e)}")

@router.patch("/{workspace_id}/sessions/{session_id}", response_model=SessionResponse)
async def update_workspace_session(
    workspace_id: str,
    session_id: str,
    payload: SessionCreate,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    session = SupabaseDBService.update_session(
        session_id=session_id,
        user_id=current_user.id,
        name=payload.name
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or access denied")
    return session

@router.delete("/{workspace_id}/sessions/{session_id}")
async def delete_workspace_session(
    workspace_id: str,
    session_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    # Fetch session documents before deleting to clean up files and vectors
    try:
        docs = SupabaseDBService.list_session_documents(session_id=session_id, user_id=current_user.id)
        for doc in docs:
            try:
                vector_store.delete_document_chunks(doc["id"])
            except Exception:
                pass
            try:
                meta = doc.get("metadata") or {}
                file_path = meta.get("file_path")
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass
    except Exception as e:
        print(f"[WARN] Error during session document cleanup: {e}")

    success = SupabaseDBService.delete_session(session_id=session_id, user_id=current_user.id)
    if not success:
        return {"message": "Session not found or already deleted"}
    return {"message": "Session deleted"}
