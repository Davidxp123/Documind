import json
from app.core.config import settings

try:
    import google.generativeai as genai
except ModuleNotFoundError:
    genai = None

if settings.GEMINI_API_KEY and genai is not None:
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
            
        if genai is None:
            return {
                "summary": "Gemini library is not installed. Document processed without AI insights.",
                "keywords": ["RAG", "DocMind", "AI", "Workspace"],
                "timeline": [{"year": "2026", "event": "Document processed without Gemini"}],
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

    @staticmethod
    def generate_query_answer(query: str, snippets: list[str]):
        if not snippets:
            return "No relevant content was found in this workspace. Please upload documents and try again."

        query_lower = query.lower()
        prefer_short = any(keyword in query_lower for keyword in ["short", "brief", "concise", "summarize", "summary"])
        prefer_long = any(keyword in query_lower for keyword in ["detailed", "comprehensive", "in depth", "explain", "describe", "why", "how"])
        max_words = 40 if prefer_short else 90 if prefer_long else 60

        if settings.GEMINI_API_KEY and genai is not None:
            model = genai.GenerativeModel("gemini-2.5-flash")
            prompt = f"""
Use the following document passages to answer the user's question. Answer in a way that matches the user's desired length: short if requested, detailed if requested, otherwise balanced and relevant.

Question:
{query}

Passages:
{chr(10).join(snippets[:5])}
"""
            response = model.generate_content(prompt)
            return response.text.strip()

        combined = " ".join(snippets[:3])
        words = combined.split()
        answer = " ".join(words[:max_words]).strip()
        if not answer.endswith("."):
            answer = answer + "."
        return f"Based on the uploaded document content, {answer}"

gemini_service = GeminiService()
