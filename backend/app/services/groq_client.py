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
            
        # Using a verified active Groq model
        self.model = "openai/gpt-oss-120b"
        self.fallback_models = ["openai/gpt-oss-20b", "groq/compound"]

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
            intro = f"Here is a comprehensive breakdown based on the document passages regarding '{query}':\n\n"
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
            return "No relevant content was found in the uploaded documents. Please ensure documents are uploaded and processed."

        intent = self.detect_query_intent(query)
        
        if self.client:
            models_to_try = [self.model] + self.fallback_models
            for model_name in models_to_try:
                try:
                    if intent == "short":
                        length_instruction = "Deliver a concise, direct answer (2-3 sentences or compact bullets)."
                    elif intent == "detailed":
                        length_instruction = "Deliver a thorough, comprehensive, structured response with clear Markdown bullet points, bold highlights, and headers."
                    else:
                        length_instruction = "Deliver a clear, professional, well-structured answer using Markdown bullets or paragraphs (60-120 words)."

                    passages_text = "\n\n".join(snippets[:10])
                    system_prompt = f"""You are DocuMind AI, an enterprise-grade document intelligence assistant.
Your job is to answer user inquiries strictly grounded in the provided document passages across all supported file formats:
- PDF and DOCX files
- Excel/CSV spreadsheets: Synthesize, interpret, compute, filter, and explain tabular data in natural language. NEVER dump raw tables or echo raw comma/pipe-separated cell lists back to the user. Always answer the question directly with clear figures, metrics, and insights derived from the table records.
- PowerPoint (PPTX) presentations: Cite relevant slide numbers (e.g. 'Slide 3 of 10') where helpful.
- Image attachments & diagrams: Ground answers in the visual document OCR labels, text, diagrams, and metadata provided.

Strict Guidelines:
1. Ground your response directly in the provided passages. Cite relevant document names or page/sheet/slide numbers where helpful.
2. If the user mentions a specific file (e.g. 'agile.png', 'Banco.pdf', 'Requirements.xlsx', 'Data.csv'), focus your answer on the content extracted from that file.
3. If combining information from multiple documents (e.g. numbers from a spreadsheet, points from a slide deck, and context from a PDF/image), present a cohesive, synthesised answer addressing all requested aspects.
4. If the provided passages do not contain the complete answer, state what related facts are available from the documents and state what is missing without hallucinating.
5. Format your output with clean Markdown formatting (bullet points, bold text).

Format requirement: {length_instruction}"""

                    chat_completion = self.client.chat.completions.create(
                        messages=[
                            {
                                "role": "system",
                                "content": system_prompt
                            },
                            {
                                "role": "user",
                                "content": f"User Query: {query}\n\nDocument Passages:\n{passages_text}"
                            }
                        ],
                        model=model_name,
                    )
                    ans = chat_completion.choices[0].message.content.strip()
                    if ans:
                        return ans
                        
                except Exception as e:
                    print(f"[ERROR] Groq API call with {model_name} failed: {e}")
                    continue

            print("[INFO] Falling back to local synthesis...")
        else:
            print("[WARNING] Groq client not initialized!")

        return self._local_fallback_answer(query, snippets, intent)

groq_client = GroqClient()

