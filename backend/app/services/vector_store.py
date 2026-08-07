import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from app.core.config import settings

class VectorStore:
    def __init__(self):
        self.chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DIR)
        self.collection = self.chroma_client.get_or_create_collection(name="docmind_rag")
        self.model = SentenceTransformer("BAAI/bge-small-en-v1.5")

    def add_document_chunks(self, workspace_id: str, doc_id: str, filename: str, chunks: list):
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
        documents = [c["text"] for c in chunks]
        metadatas = [
            {
                "workspace_id": workspace_id,
                "doc_id": doc_id,
                "filename": filename,
                "page": c["page"],
            }
            for c in chunks
        ]
        embeddings = self.model.encode(documents).tolist()

        self.collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def delete_document_chunks(self, doc_id: str):
        try:
            self.collection.delete(where={"doc_id": doc_id})
        except Exception:
            pass

    def query(self, workspace_id: str, query_text: str, top_k: int = 6, doc_ids: list = None):
        query_embedding = self.model.encode([query_text]).tolist()
        
        where_clause = {"workspace_id": workspace_id}
        if doc_ids and len(doc_ids) == 1:
            where_clause = {"$and": [{"workspace_id": workspace_id}, {"doc_id": doc_ids[0]}]}
        elif doc_ids and len(doc_ids) > 1:
            where_clause = {"$and": [{"workspace_id": workspace_id}, {"doc_id": {"$in": doc_ids}}]}

        try:
            results = self.collection.query(
                query_embeddings=query_embedding,
                n_results=top_k,
                where=where_clause,
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            results = self.collection.query(
                query_embeddings=query_embedding,
                n_results=top_k,
                where={"workspace_id": workspace_id},
                include=["documents", "metadatas", "distances"],
            )

        if hasattr(results, "to_dict"):
            results = results.to_dict()

        if not isinstance(results, dict):
            try:
                results = dict(results)
            except Exception:
                return {"documents": [], "metadatas": [], "distances": []}

        return results

vector_store = VectorStore()
