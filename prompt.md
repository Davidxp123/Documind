# Task: Migrate DocuMind backend to LangGraph + Groq + Pinecone

## Objective

Refactor the FastAPI backend so that:
- Vector storage moves from local Chroma (`storage/chroma_db/`) to **Pinecone**.
- LLM calls for query answers and document insights move from **Gemini** to **Groq**.
- The retrieve → generate flow is orchestrated by a **LangGraph** `StateGraph` instead of plain function calls.
- All existing API routes and response shapes in `documents.py` and `workspaces.py` stay unchanged — only the service layer underneath changes.

Do not change the request/response schemas in `app/models/schemas.py` unless a field is strictly necessary for the new services (e.g. adding an optional `pinecone` health check field is fine; renaming existing fields is not).

## Current structure (before)

```
backend/app/
├── api/v1/endpoints/documents.py
├── api/v1/endpoints/workspaces.py
├── core/config.py
├── core/database.py
├── models/db_models.py
├── models/schemas.py
├── services/document_processor.py
├── services/vector_store.py       # Chroma-backed
├── services/gemini_service.py     # thin wrapper -> llm_generator / insights_extractor
├── services/llm_generator.py      # Gemini genai calls + local fallback
└── services/insights_extractor.py # Gemini-based summary/keywords/timeline/entities
```

## Target structure (after)

```
backend/app/
├── api/v1/endpoints/documents.py       # unchanged interface; calls rag_service instead of gemini_service
├── api/v1/endpoints/workspaces.py      # unchanged
├── core/config.py                      # + GROQ_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME
├── core/database.py                    # unchanged
├── graph/
│   ├── __init__.py
│   ├── state.py                        # NEW - shared LangGraph state schema
│   ├── nodes.py                        # NEW - retrieve_node, generate_node, synthesize_node, insights_node
│   └── workflow.py                     # NEW - builds and compiles the StateGraph
├── models/db_models.py                 # unchanged
├── models/schemas.py                   # unchanged unless noted above
├── services/document_processor.py      # unchanged
├── services/pinecone_store.py          # NEW - replaces vector_store.py
├── services/groq_client.py             # NEW - replaces llm_generator.py
├── services/insights_extractor.py      # MODIFIED - calls groq_client instead of Gemini
├── services/rag_service.py             # NEW - replaces gemini_service.py, invokes the compiled graph
├── services/vector_store.py            # DELETE after pinecone_store.py is verified working
├── services/gemini_service.py          # DELETE after rag_service.py is verified working
└── services/llm_generator.py           # DELETE after groq_client.py is verified working
```

## Step-by-step instructions

### 1. Dependencies

In `backend/requirements.txt`:
- Remove: `google-generativeai`, `chromadb` (and any Chroma-only transitive deps not needed elsewhere)
- Add: `langgraph`, `langchain-groq`, `groq`, `pinecone`

### 2. Environment / config

In `app/core/config.py`, add to the `Settings` class:
```python
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "docmind-index")
```
Keep the existing `.env` discovery logic as-is. Do not remove `GEMINI_API_KEY` from `.env.example` yet — leave a comment marking it deprecated, in case of rollback.

### 3. `app/services/pinecone_store.py` (replaces `vector_store.py`)

Preserve the exact same public interface as the current `vector_store` singleton so `documents.py` doesn't need changes beyond the import:
- `add_document_chunks(workspace_id: str, doc_id: str, filename: str, chunks: list[str]) -> None`
- `query(workspace_id: str, query_text: str, top_k: int = 6, doc_ids: list[str] | None = None) -> dict` — must return a dict with `documents` and `metadatas` keys in the same shape currently consumed in `documents.py` (`workspace_query`), including per-chunk `filename` and `page` in metadata.
- `delete_document_chunks(doc_id: str) -> None`

Implementation notes:
- Initialize the Pinecone client using `settings.PINECONE_API_KEY`.
- Use `settings.PINECONE_INDEX_NAME`; create the index on startup if it doesn't exist (serverless spec, cosine metric, dimension matching whatever embedding model is chosen).
- Use workspace_id as a metadata filter (or namespace) so queries stay scoped per workspace, matching current Chroma behavior.
- Pick and document an embedding model/provider for turning chunks into vectors (this wasn't specified — use a reasonable default and call it out clearly in code comments so it's easy to swap later).

### 4. `app/services/groq_client.py` (replaces `llm_generator.py`)

Keep the same public surface as `llm_generator`:
- `detect_query_intent(query: str) -> str` — keep this logic as-is, it's provider-agnostic.
- `generate_answer(query: str, snippets: list[str]) -> str`
- Keep `_local_fallback_answer` as-is for when the Groq call fails or `GROQ_API_KEY` is missing — same silent-fallback behavior, but keep the `[DEBUG]`/`[WARNING]`/`[ERROR]` print statements so failures stay diagnosable in logs.

Implementation notes:
- Use the `groq` Python SDK or `langchain-groq`'s `ChatGroq` — pick one and be consistent with what `app/graph/nodes.py` uses.
- Use a current Groq-hosted model (e.g. `llama-3.3-70b-versatile`) — don't hardcode a model id without checking it's still active on Groq's model list.
- Preserve the three `length_instruction` variants (short / detailed / standard) from the current prompt logic.

### 5. `app/services/insights_extractor.py` (modified in place)

Swap whatever Gemini calls exist here for `groq_client` calls, keeping the existing return shape (`summary`, `keywords`, `timeline`, `entities`) that `documents.py`'s `process_document_background` already expects.

### 6. `app/graph/state.py` (new)

Define a `TypedDict` (or Pydantic model) representing the shared graph state, at minimum:
```python
class RAGState(TypedDict):
    query: str
    workspace_id: str
    doc_ids: list[str] | None
    snippets: list[str]
    metadatas: list[dict]
    answer: str
```
Add a separate state type for the ingestion/insights flow if it doesn't share enough fields with the query flow to reuse one state.

### 7. `app/graph/nodes.py` (new)

Implement as plain functions taking and returning `RAGState`:
- `retrieve_node(state)` — calls `pinecone_store.query(...)`, populates `snippets`/`metadatas`.
- `generate_node(state)` — calls `groq_client.generate_answer(...)`, populates `answer`.
- `synthesize_node(state)` — final formatting pass on `answer` if needed (can be a no-op pass-through initially).
- `insights_node(state)` — used by the ingestion graph, wraps `insights_extractor`.

### 8. `app/graph/workflow.py` (new)

Build two compiled graphs (or one graph with conditional entry points):
- A **query graph**: `retrieve_node → generate_node → synthesize_node`.
- An **ingestion graph**: chunking/embedding (via `pinecone_store`) → `insights_node`.

Export compiled graph instances that `rag_service.py` can invoke directly, e.g. `query_graph`, `ingestion_graph`.

### 9. `app/services/rag_service.py` (replaces `gemini_service.py`)

Same public interface as `gemini_service`:
```python
class RAGService:
    @staticmethod
    def generate_document_insights(full_text: str) -> dict: ...
    @staticmethod
    def generate_query_answer(query: str, snippets: list[str]) -> str: ...

rag_service = RAGService()
```
Internally these should invoke the compiled LangGraph graphs from `app/graph/workflow.py` rather than calling services directly, so the graph is the single orchestration point.

### 10. `app/api/v1/endpoints/documents.py`

Update the single import line:
```python
from app.services.rag_service import rag_service
```
Replace all `gemini_service.` calls with `rag_service.` — same method names, no other changes needed in this file.

### 11. Cleanup

Once the new services are verified working end-to-end (upload → insights populate, query → Groq-generated answer, Pinecone dashboard shows the index populated):
- Delete `vector_store.py`, `gemini_service.py`, `llm_generator.py`.
- Delete `backend/storage/chroma_db/` (no longer used).
- Remove `google-generativeai` and `chromadb` fully from `requirements.txt` if not already done in step 1.

## Verification checklist

- [ ] `pip install -r requirements.txt` succeeds with the new dependency set.
- [ ] Uploading a document creates vectors in the Pinecone index (check Pinecone console) instead of `storage/chroma_db/`.
- [ ] Document insights (summary/keywords/timeline/entities) are populated after upload, generated via Groq.
- [ ] `/query` returns an answer generated by Groq (verify via Groq's usage dashboard, not just app behavior).
- [ ] Local fallback still works if `GROQ_API_KEY` is unset (test by temporarily removing it).
- [ ] No remaining imports of `google.generativeai`, `chromadb`, or the deleted service files anywhere in the codebase.

## Additional task: make the frontend fully responsive

Independent of the backend migration above, audit and fix responsiveness across the whole Next.js frontend (`frontend/src/app/` and `frontend/src/components/`). Do not change the existing glassmorphic visual style, colors, or the background video — only fix layout/sizing behavior across breakpoints.

Pages/components in scope:
- `app/page.tsx` (landing)
- `app/about/page.tsx`
- `app/pricing/page.tsx`
- `app/product/page.tsx`
- `app/workspace/[workspaceId]/page.tsx` (highest priority — has the most complex layout: session list, chat panel, insights/keywords panel, document library)
- `components/Background/BackgroundVideo.tsx`
- `components/landing/CtaFooter.tsx`

Requirements:
- No horizontal scrolling or clipped content at common breakpoints: mobile (~375px), tablet (~768px), laptop (~1280px), and wide desktop (~1920px).
- On the workspace page specifically: the multi-column layout (sessions / chat / insights) should collapse gracefully on narrower screens (e.g. stacked or tab/drawer-based) rather than squeezing columns unreadably thin.
- Glass containers keep their existing thin white edge styling at every breakpoint — don't lose it when switching to stacked/mobile layouts.
- Text, buttons, and form inputs stay legible and tappable (minimum ~44px touch target) on mobile.
- The background video continues playing behind content at all viewport sizes without being cropped in a way that hides key visual elements.
- Use Tailwind's responsive utility classes (`sm:`, `md:`, `lg:`, `xl:`) consistently rather than fixed pixel widths, unless a fixed width is intentional (e.g. a max-width container).

Verification:
- [ ] Manually resize the browser (or use device emulation) across the breakpoints above on every page listed and confirm no overflow, overlap, or clipped content.
- [ ] Workspace page's three-panel layout is usable on mobile without horizontal scrolling.
- [ ] Existing glassmorphic style (blur, white edges, background video) is unchanged, just responsive.
