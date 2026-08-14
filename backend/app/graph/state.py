from typing import TypedDict, List, Optional

class RAGState(TypedDict):
    query: str
    workspace_id: str
    doc_ids: Optional[List[str]]
    snippets: List[str]
    metadatas: List[dict]
    answer: str

class IngestionState(TypedDict):
    full_text: str
    insights: dict
