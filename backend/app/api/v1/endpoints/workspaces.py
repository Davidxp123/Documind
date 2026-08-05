import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.models.db_models import Workspace
from app.models.schemas import WorkspaceCreate, WorkspaceResponse

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
