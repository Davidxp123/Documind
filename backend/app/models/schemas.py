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

class ChatQueryRequest(BaseModel):
    workspace_id: str
    query: str

class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    citations: Optional[List[Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True
