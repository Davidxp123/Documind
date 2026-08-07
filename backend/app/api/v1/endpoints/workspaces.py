import uuid
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.db_models import Workspace, Session, Document
from app.models.schemas import WorkspaceCreate, WorkspaceResponse, SessionCreate, SessionResponse
from app.services.vector_store import vector_store

router = APIRouter()

@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(payload: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    workspace_id = str(uuid.uuid4())
    ws = Workspace(id=workspace_id, name=payload.name, description=payload.description)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws

@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workspace))
    return result.scalars().all()

@router.post("/{workspace_id}/sessions", response_model=SessionResponse)
async def create_workspace_session(workspace_id: str, payload: SessionCreate, db: AsyncSession = Depends(get_db)):
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        workspace = Workspace(id=workspace_id, name="Demo Workspace")
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)

    session = Session(id=str(uuid.uuid4()), workspace_id=workspace_id, name=payload.name)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/{workspace_id}/sessions", response_model=list[SessionResponse])
async def list_workspace_sessions(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.workspace_id == workspace_id))
    return result.scalars().all()

@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_workspace_session(session_id: str, payload: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.name = payload.name
    await db.commit()
    await db.refresh(session)
    return session

@router.delete("/sessions/{session_id}")
async def delete_workspace_session(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(Document).where(Document.session_id == session_id))
    documents = result.scalars().all()
    for doc in documents:
        try:
            vector_store.delete_document_chunks(doc.id)
        except Exception:
            pass
        try:
            if doc.file_path and os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except Exception:
            pass

    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
