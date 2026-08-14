import os
import re
from groq import Groq
from app.core.config import settings

class GroqClient:
    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        if self.api_key:
            self.client = Groq(api_key=self.api_key)
        else:
            self.client = None
            print("[WARNING] GROQ_API_KEY not found in settings!")
            
        # Using a current Groq-hosted model
        self.model = "llama-3.3-70b-versatile"

    def detect_query_intent(self, query: str) -> str:
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

    def _local_fallback_answer(self, query: str, snippets: list[str], intent: str) -> str:
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

    def generate_answer(self, query: str, snippets: list[str]) -> str:
        if not snippets:
            return "No relevant content was found in this workspace. Please upload documents and try again."

        intent = self.detect_query_intent(query)
        
        if self.client:
            try:
                print(f"[DEBUG] Groq API Key loaded: {self.api_key[:8]}...")
                
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
                print("[DEBUG] Sending request to Groq API...")
                chat_completion = self.client.chat.completions.create(
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    model=self.model,
                )
                ans = chat_completion.choices[0].message.content.strip()
                
                if ans:
                    print("[SUCCESS] Answer received from Groq API!")
                    return ans
                    
            except Exception as e:
                print(f"[ERROR] Groq API call failed: {e}")
                print("[INFO] Falling back to local synthesis...")
        else:
            print("[WARNING] Groq client not initialized!")

        return self._local_fallback_answer(query, snippets, intent)

groq_client = GroqClient()
