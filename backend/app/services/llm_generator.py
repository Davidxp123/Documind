import re
from app.core.config import settings

try:
    import google.generativeai as genai
except ModuleNotFoundError:
    genai = None

class LLMGenerator:
    @staticmethod
    def detect_query_intent(query: str) -> str:
        q_lower = query.lower()
        
        # Check explicit length keywords
        short_keywords = ["short", "brief", "briefly", "concise", "summarize", "summary", "quick", "tldr", "overview", "in one sentence"]
        detailed_keywords = ["detailed", "comprehensive", "in depth", "in-depth", "explain", "describe", "why", "how", "elaborate", "thorough", "step by step", "step-by-step", "list all", "breakdown", "details"]

        for kw in short_keywords:
            if kw in q_lower:
                return "short"

        for kw in detailed_keywords:
            if kw in q_lower:
                return "detailed"

        return "standard"

    @classmethod
    def _local_fallback_answer(cls, query: str, snippets: list[str], intent: str) -> str:
        """Intelligent local synthesis of passages when LLM API is unavailable."""
        query_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', query.lower()))
        
        # Combine snippets and split into sentences
        combined_text = " ".join(snippets)
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', combined_text) if len(s.strip()) > 10]

        # Score sentences based on query word occurrences
        scored_sentences = []
        for sent in sentences:
            sent_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower()))
            overlap = len(query_words.intersection(sent_words))
            scored_sentences.append((overlap, sent))

        scored_sentences.sort(key=lambda x: x[0], reverse=True)
        top_sentences = [sent for score, sent in scored_sentences if score > 0]
        if not top_sentences:
            top_sentences = [sent for _, sent in scored_sentences[:5]]

        if intent == "short":
            selected = top_sentences[:2]
            ans = " ".join(selected)
            if not ans.endswith("."):
                ans += "."
            return f"Based on the document context: {ans}"

        elif intent == "detailed":
            intro = f"Here is a comprehensive breakdown based on the document passages regarding '{query}':\n"
            bullet_points = []
            seen = set()
            for sent in top_sentences[:6]:
                if sent not in seen:
                    seen.add(sent)
                    bullet_points.append(f"- {sent}")
            return intro + "\n".join(bullet_points)

        else: # standard
            selected = top_sentences[:3]
            ans = " ".join(selected)
            if not ans.endswith("."):
                ans += "."
            return f"Based on the uploaded documents: {ans}"

    @classmethod
    def generate_answer(cls, query: str, snippets: list[str]) -> str:
        if not snippets:
            return "No relevant content was found in this workspace. Please upload documents and try again."

        intent = cls.detect_query_intent(query)
        api_key = settings.GEMINI_API_KEY or ""

        if api_key and genai is not None:
            try:
                print(f"[DEBUG] Gemini API Key loaded: {api_key[:8]}...")
                genai.configure(api_key=api_key)
                
                # Using a valid Google model ID (gemini-1.5-flash)
                model = genai.GenerativeModel("gemini-3.6-flash")
                
                if intent == "short":
                    length_instruction = "Deliver a concise, direct, 1-2 sentence answer (20-40 words)."
                elif intent == "detailed":
                    length_instruction = "Deliver a thorough, comprehensive, structured, and detailed response with clear bullet points or headers."
                else:
                    length_instruction = "Deliver a balanced, high-quality, professional answer (60-100 words)."

                prompt = f"""
You are DocuMind AI, an expert research assistant.
Use the following document passages to accurately answer the user's query.

FORMAT INSTRUCTION: {length_instruction}

User Query:
{query}

Retrieved Document Passages:
{chr(10).join(snippets[:6])}
"""
                print("[DEBUG] Sending request to Gemini API...")
                response = model.generate_content(prompt)
                ans = response.text.strip()
                
                if ans:
                    print("[SUCCESS] Answer received from Gemini API!")
                    return ans
                    
            except Exception as e:
                print(f"[ERROR] Gemini API call failed: {e}")
                print("[INFO] Falling back to local synthesis...")

        else:
            if not api_key:
                print("[WARNING] No GEMINI_API_KEY found in settings!")
            if genai is None:
                print("[WARNING] google-generativeai module is not installed!")

        return cls._local_fallback_answer(query, snippets, intent)

llm_generator = LLMGenerator()
