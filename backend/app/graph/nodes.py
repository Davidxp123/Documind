from app.services.pinecone_store import pinecone_store
from app.services.groq_client import groq_client
from app.services.insights_extractor import insights_extractor
from .state import RAGState, IngestionState

def retrieve_node(state: RAGState) -> RAGState:
    # Skip retrieval if snippets are already provided (e.g. from rag_service legacy call)
    if state.get("snippets") and state.get("workspace_id") == "bypass":
        return state

    results = pinecone_store.query(
        workspace_id=state["workspace_id"],
        query_text=state["query"],
        top_k=6,
        doc_ids=state.get("doc_ids")
    )
    
    documents = results.get("documents") or []
    metadatas = results.get("metadatas") or []
    
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
        
    return {**state, "snippets": snippets, "metadatas": metadatas}

def generate_node(state: RAGState) -> RAGState:
    answer = groq_client.generate_answer(state["query"], state["snippets"])
    return {**state, "answer": answer}

def synthesize_node(state: RAGState) -> RAGState:
    # Optional final formatting pass - here we just ensure the state is passed through
    return state

def insights_node(state: IngestionState) -> IngestionState:
    insights = insights_extractor.generate_document_insights(state["full_text"])
    return {**state, "insights": insights}
