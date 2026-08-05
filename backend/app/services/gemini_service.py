import json
import google.generativeai as genai
from app.core.config import settings

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

class GeminiService:
    @staticmethod
    def generate_document_insights(full_text: str):
        if not settings.GEMINI_API_KEY:
            return {
                "summary": "Gemini API key not set. Dummy summary: Document contains structured text.",
                "keywords": ["RAG", "DocMind", "AI", "Workspace"],
                "timeline": [{"year": "2026", "event": "Document processed"}],
                "entities": ["DocMind AI", "System"]
            }
            
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = f"""
Analyze the following document text and return ONLY a JSON object with this exact structure:
{{
  "summary": "Executive summary of 3-4 sentences...",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "timeline": [{{"date_or_year": "...", "event": "..."}}],
  "entities": ["entity1", "entity2"]
}}

Document Content:
{full_text[:10000]}
"""
        response = model.generate_content(prompt)
        try:
            return json.loads(response.text.strip('```json').strip('```'))
        except Exception:
            return {
                "summary": response.text[:300],
                "keywords": ["Analysis"],
                "timeline": [],
                "entities": []
            }

gemini_service = GeminiService()
