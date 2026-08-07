import json
import re
from collections import Counter
from app.core.config import settings

try:
    import google.generativeai as genai
except ModuleNotFoundError:
    genai = None

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can",
    "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had",
    "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if",
    "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor", "not",
    "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own",
    "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "very",
    "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "with", "would", "you",
    "your", "yours", "yourself", "yourselves", "this", "that", "page", "document", "file", "text"
}

class InsightsExtractor:
    @staticmethod
    def _extract_nlp_insights(text: str) -> dict:
        """Intelligent local NLP extraction fallback for summaries, keywords, timeline, and entities."""
        clean_text = text.strip()
        if not clean_text:
            return {
                "summary": "Document processed. No text content found to summarize.",
                "keywords": ["Document", "Text"],
                "timeline": [],
                "entities": []
            }

        # Sentence extraction & scoring for summary
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', clean_text) if len(s.strip()) > 15]
        words = re.findall(r'\b[a-zA-Z]{3,}\b', clean_text.lower())
        filtered_words = [w for w in words if w not in STOPWORDS]
        word_counts = Counter(filtered_words)

        top_keywords = [word.capitalize() for word, _ in word_counts.most_common(8)]
        if not top_keywords:
            top_keywords = ["Document", "Content"]

        # Sentence scoring
        sentence_scores = {}
        for sent in sentences[:30]:
            sent_words = re.findall(r'\b[a-zA-Z]{3,}\b', sent.lower())
            score = sum(word_counts.get(w, 0) for w in sent_words if w not in STOPWORDS)
            sentence_scores[sent] = score

        sorted_sentences = sorted(sentence_scores.keys(), key=lambda s: sentence_scores[s], reverse=True)
        top_sentences = sorted_sentences[:3] if len(sorted_sentences) >= 3 else sentences[:3]
        summary = " ".join(top_sentences) if top_sentences else clean_text[:250]

        # Extract potential timeline dates/years
        date_matches = re.findall(r'\b(19\d{2}|20\d{2}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b', clean_text)
        timeline = []
        seen_dates = set()
        for date in date_matches:
            if date not in seen_dates:
                seen_dates.add(date)
                timeline.append({"date_or_year": date, "event": f"Reference to {date} in document."})
                if len(timeline) >= 4:
                    break

        # Extract capitalized entities
        entity_matches = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', clean_text)
        entities = []
        seen_entities = set()
        for ent in entity_matches:
            if ent.lower() not in STOPWORDS and ent not in seen_entities and len(ent) > 3:
                seen_entities.add(ent)
                entities.append(ent)
                if len(entities) >= 6:
                    break

        return {
            "summary": summary,
            "keywords": top_keywords,
            "timeline": timeline,
            "entities": entities
        }

    @classmethod
    def generate_document_insights(cls, full_text: str) -> dict:
        api_key = settings.GEMINI_API_KEY or ""
        if api_key and genai is not None:
            try:
                genai.configure(api_key=api_key)
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
                parsed = json.loads(response.text.strip('`').strip('json').strip())
                if isinstance(parsed, dict) and "summary" in parsed and "keywords" in parsed:
                    return parsed
            except Exception:
                pass

        return cls._extract_nlp_insights(full_text)

insights_extractor = InsightsExtractor()
