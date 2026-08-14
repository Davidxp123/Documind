from app.graph import query_graph, ingestion_graph

class RAGService:
    @staticmethod
    def generate_document_insights(full_text: str) -> dict:
        initial_state = {"full_text": full_text, "insights": {}}
        try:
            final_state = ingestion_graph.invoke(initial_state)
            return final_state.get("insights", {})
        except Exception as e:
            print(f"[ERROR] Ingestion graph failed: {e}")
            from app.services.insights_extractor import insights_extractor
            return insights_extractor.generate_document_insights(full_text)

    @staticmethod
    def generate_query_answer(query: str, snippets: list[str]) -> str:
        initial_state = {
            "query": query,
            "workspace_id": "bypass",
            "doc_ids": None,
            "snippets": snippets,
            "metadatas": [],
            "answer": ""
        }
        try:
            final_state = query_graph.invoke(initial_state)
            return final_state.get("answer", "")
        except Exception as e:
            print(f"[ERROR] Query graph failed: {e}")
            from app.services.groq_client import groq_client
            return groq_client.generate_answer(query, snippets)

rag_service = RAGService()
