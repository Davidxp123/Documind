from app.services.insights_extractor import insights_extractor
from app.services.llm_generator import llm_generator

class GeminiService:
    @staticmethod
    def generate_document_insights(full_text: str) -> dict:
        return insights_extractor.generate_document_insights(full_text)

    @staticmethod
    def generate_query_answer(query: str, snippets: list[str]) -> str:
        return llm_generator.generate_answer(query, snippets)

gemini_service = GeminiService()
