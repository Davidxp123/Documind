from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: str
    session_id: Optional[str] = None
    workspace_id: Optional[str] = "default"
    filename: str
    file_type: str
    file_size: int = 0
    status: str = "pending"
    page_count: int = 0
    summary: Optional[str] = None
    keywords: Optional[List[str]] = None
    timeline: Optional[List[Any]] = None
    entities: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True

class SessionCreate(BaseModel):
    name: str

class SessionResponse(BaseModel):
    id: str
    name: str
    workspace_id: Optional[str] = "default"
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True

class SessionAssignRequest(BaseModel):
    session_id: Optional[str] = None

class ChatQueryRequest(BaseModel):
    query: str
    workspace_id: Optional[str] = "default"
    session_id: Optional[str] = None
    doc_ids: Optional[List[str]] = None

class ChatMessageResponse(BaseModel):
    id: str
    session_id: Optional[str] = None
    role: str
    content: str
    sources: Optional[List[Any]] = None
    citations: Optional[List[Any]] = None
    created_at: Optional[Any] = None
    timestamp: Optional[Any] = None

    class Config:
        from_attributes = True
