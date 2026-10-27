import time
import os
from pinecone import Pinecone, ServerlessSpec
from fastembed import TextEmbedding
from app.core.config import settings

class PineconeStore:
    def __init__(self):
        if not settings.PINECONE_API_KEY:
            self.pc = None
            self.index = None
            self.model = None
            print("[WARNING] PINECONE_API_KEY not found in settings!")
            return

        self.pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        self.index_name = settings.PINECONE_INDEX_NAME
        
        cache_dir = os.path.join(settings.STORAGE_DIR, "fastembed_cache")
        os.makedirs(cache_dir, exist_ok=True)
        self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=cache_dir)
        self.dimension = 384
        
        # Create index if it doesn't exist
        existing_indexes = [idx.name for idx in self.pc.list_indexes()]
        if self.index_name not in existing_indexes:
            print(f"[INFO] Creating Pinecone index: {self.index_name}")
            self.pc.create_index(
                name=self.index_name,
                dimension=self.dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1")
            )
            # Wait for index to be ready
            while not self.pc.describe_index(self.index_name).status["ready"]:
                time.sleep(1)
        
        self.index = self.pc.Index(self.index_name)

    def _embed(self, texts: list[str]) -> list[list[float]]:
        if not self.model or not texts:
            return []
        return [vec.tolist() for vec in self.model.embed(texts)]

    def add_document_chunks(self, workspace_id: str, doc_id: str, filename: str, chunks: list) -> None:
        if not self.index:
            print("[ERROR] Pinecone index not initialized.")
            return

        documents = [c["text"] for c in chunks]
        embeddings = self._embed(documents)
        
        vectors = []
        for i, chunk in enumerate(chunks):
            vectors.append({
                "id": f"{doc_id}_{i}",
                "values": embeddings[i],
                "metadata": {
                    "workspace_id": workspace_id,
                    "doc_id": doc_id,
                    "filename": filename,
                    "page": chunk["page"],
                    "text": chunk["text"]
                }
            })
        
        # Pinecone upsert in batches of 100
        for i in range(0, len(vectors), 100):
            self.index.upsert(vectors=vectors[i:i+100])

    def query(self, workspace_id: str, query_text: str, top_k: int = 6, doc_ids: list | None = None) -> dict:
        if not self.index:
            return {"documents": [], "metadatas": [], "distances": []}

        query_embeddings = self._embed([query_text])
        if not query_embeddings:
            return {"documents": [], "metadatas": [], "distances": []}
        query_embedding = query_embeddings[0]
        
        filter_dict = {"workspace_id": workspace_id}
        if doc_ids:
            if len(doc_ids) == 1:
                filter_dict["doc_id"] = doc_ids[0]
            else:
                filter_dict["doc_id"] = {"$in": doc_ids}
                
        try:
            results = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                filter=filter_dict,
                include_metadata=True
            )
            
            # Format to match Chroma's list-of-lists structure for compatibility
            return {
                "documents": [[match.metadata["text"] for match in results.matches]],
                "metadatas": [[match.metadata for match in results.matches]],
                "distances": [[1.0 - match.score for match in results.matches]] # Convert score to pseudo-distance
            }
        except Exception as e:
            print(f"[ERROR] Pinecone query failed: {e}")
            return {"documents": [], "metadatas": [], "distances": []}

    def delete_document_chunks(self, doc_id: str) -> None:
        if not self.index:
            return
        try:
            # Pinecone delete by filter is only supported on pods-based indexes or with metadata filtering
            # For serverless, we can use metadata filters if configured
            self.index.delete(filter={"doc_id": doc_id})
        except Exception as e:
            print(f"[ERROR] Pinecone delete failed: {e}")

pinecone_store = PineconeStore()
