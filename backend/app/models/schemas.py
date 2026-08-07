from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: str
    workspace_id: str
    session_id: Optional[str] = None
    filename: str
    file_type: str
    file_size: int
    status: str
    page_count: int
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None
    timeline: Optional[List[Any]] = None
    entities: Optional[List[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SessionCreate(BaseModel):
    name: str

class SessionResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class SessionAssignRequest(BaseModel):
    session_id: Optional[str] = None

class ChatQueryRequest(BaseModel):
    workspace_id: str
    query: str
    session_id: Optional[str] = None
    doc_ids: Optional[List[str]] = None

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: Optional[List[Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True
