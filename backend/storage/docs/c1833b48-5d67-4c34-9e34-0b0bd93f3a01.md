# DocuMind — Product & Technical Documentation

## 1. What DocuMind Is

DocuMind is a full-stack **Retrieval-Augmented Generation (RAG)** application that lets a user create isolated **workspaces** and **sessions**, upload documents of various formats into them, and have an AI assistant answer questions strictly grounded in the content of those documents. Alongside Q&A, every uploaded document automatically gets an AI-generated **executive summary, keyword list, timeline, and named entities**.

It is composed of two independently deployable halves:

- **Frontend** — Next.js 15 (App Router) + React 19 + TypeScript, styled with Tailwind CSS in a dark "liquid glass" aesthetic, talking to the backend over plain REST/JSON.
- **Backend** — FastAPI (async Python), orchestrating document ingestion, vector search, and LLM generation through a **LangGraph** state-machine pipeline.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend framework | Next.js 15 (App Router), React 19, TypeScript | Page routing, SSR/CSR rendering |
| Styling | Tailwind CSS 3 + custom "liquid-glass" utility classes | Glassmorphic dark UI |
| Frontend state/data | Zustand, TanStack React Query | Client state & server-state caching (available, see note below) |
| Frontend utilities | react-dropzone, react-markdown, recharts, hls.js, lucide-react | File uploads, markdown rendering, charts, streaming background video, icons |
| Backend framework | FastAPI + Uvicorn | Async REST API |
| ORM / DB | SQLAlchemy (async) + `aiosqlite` | Relational storage — SQLite file, accessed asynchronously |
| Orchestration | **LangGraph** (`StateGraph`) | Explicit graph-based pipelines for query answering and ingestion insight generation |
| LLM provider | **Groq** (`openai/gpt-oss-120b`, with fallbacks) | Answer generation, insight/summary generation |
| Vector database | **Pinecone** (serverless, AWS us-east-1) | Semantic similarity search over document chunks |
| Embedding model | `sentence-transformers` — `BAAI/bge-small-en-v1.5` (384-dim) | Turns text chunks and queries into vectors |
| Document parsing | PyMuPDF (`fitz`), `python-docx`, `pandas`/`openpyxl`, `python-pptx`, `BeautifulSoup`, `Pillow` + `pytesseract` | Format-specific text extraction |
| Chunking | `langchain_text_splitters.RecursiveCharacterTextSplitter` | Splits extracted text into overlapping chunks for embedding |
| Background video | Mux HLS stream via `hls.js` | Full-page looping background video on marketing pages |

**Note on `zustand` / `react-query`:** both are listed in `package.json`, meaning the project is set up to use them, but they aren't used in any of the files reviewed so far (the marketing pages are static server components with no client data-fetching). It's likely the actual data-fetching/state logic lives inside `workspace/[workspaceId]/page.tsx`, which is the one file still pending — see the placeholder in Section 7.

---

## 3. High-Level Architecture

```
┌─────────────────────────────┐        REST/JSON        ┌──────────────────────────────┐
│   Next.js Frontend           │  ───────────────────►   │   FastAPI Backend             │
│   (marketing pages +         │  ◄───────────────────   │   /api/v1/workspaces           │
│    workspace UI)             │                          │   /api/v1/documents            │
└─────────────────────────────┘                          └───────────┬──────────────────┘
                                                                       │
                    ┌──────────────────────────────────────────────────┼───────────────────────────┐
                    │                                                  │                             │
                    ▼                                                  ▼                             ▼
          ┌───────────────────┐                         ┌───────────────────────┐      ┌───────────────────────┐
          │  SQLite (async)     │                         │  Pinecone Vector Store  │      │  Groq LLM API           │
          │  workspaces,          │                         │  (per-chunk embeddings, │      │  answer generation,     │
          │  sessions,             │                         │  metadata-filtered      │      │  insight/summary        │
          │  documents,            │                         │  cosine search)         │      │  generation              │
          │  chat_messages         │                         └───────────────────────┘      └───────────────────────┘
          └───────────────────┘
                    ▲
                    │
          ┌───────────────────┐
          │  Local filesystem    │
          │  storage/docs/         │
          │  (raw uploaded files)  │
          └───────────────────┘
```

Two **LangGraph** graphs sit between the API layer and the LLM/vector layers:
- **`query_graph`** — `retrieve → generate → synthesize` (answers a chat question)
- **`ingestion_graph`** — `insights` (produces summary/keywords/timeline/entities for a newly uploaded document)

---

## 4. Backend — File-by-File Breakdown

### 4.1 `main.py` — Application Entrypoint
- Creates the `FastAPI` app, named from `settings.PROJECT_NAME`.
- Adds permissive CORS middleware (`allow_origins=["*"]`) — fine for local dev, would need tightening for production.
- On the `startup` event: ensures `storage/docs`, `storage/chroma_db`, and `storage/sqlite` directories exist, then calls `init_db()` to create tables.
- Mounts the versioned API router at `/api/v1` (from `settings.API_V1_STR`).
- Exposes a root `GET /` health check that returns a static status string.

### 4.2 `core/config.py` — Settings
- Loads a `.env` file, searching first in the backend directory, then the project root, then falling back to default `dotenv` behavior.
- Defines a Pydantic `Settings` class (or a hand-rolled fallback if `pydantic-settings`/`pydantic.BaseSettings` aren't available) holding:
  - `PROJECT_NAME`, `API_V1_STR`
  - `GEMINI_API_KEY` (explicitly marked deprecated — the project **migrated from Gemini to Groq** as its LLM provider)
  - `GROQ_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` (defaults to `"docmind-index"`)
  - Storage paths: `BASE_DIR`, `STORAGE_DIR`, `DOCS_DIR`, `CHROMA_DIR`, and a computed `SQLITE_URL` (`sqlite+aiosqlite:///.../storage/sqlite/docmind.db`)
- `CHROMA_DIR` still exists as a setting/folder even though the active vector store is Pinecone — this is legacy from an earlier Chroma-based version (the `structure.txt` shows a `chroma_db` folder and a stale `__pycache__/vector_store...pyc` file, confirming the migration).

### 4.3 `core/database.py` — DB Engine & Schema Migration Helper
- Creates an async SQLAlchemy engine against the SQLite URL and an `AsyncSessionLocal` sessionmaker.
- `get_db()` is a FastAPI dependency that yields a session per-request.
- `init_db()` creates all tables from `Base.metadata`, then runs `_ensure_sqlite_schema` — a **manual lightweight migration**: it inspects the `documents` and `chat_messages` tables and, if a `session_id` column is missing (i.e., the DB was created before sessions existed), adds it with `ALTER TABLE ... ADD COLUMN`. This is how the app avoids needing Alembic while still evolving its schema.

### 4.4 `models/db_models.py` — SQLAlchemy ORM Models
Four tables, all using string UUIDs as primary keys:

- **`Workspace`** — top-level container (`id`, `name`, `description`, `created_at`). Has cascading relationships to `documents`, `sessions`, `messages` — deleting a workspace in the ORM sense would delete everything under it (though no endpoint currently exposes workspace deletion).
- **`Session`** — belongs to a workspace (`workspace_id` FK). Represents a single chat "project" inside a workspace. Cascades to its own `documents` and `messages`.
- **`Document`** — belongs to a workspace and optionally a session. Tracks `filename`, `file_type`, `file_path` (physical location on disk), `file_size`, and a `status` field that moves through `pending → processing → completed` (or `failed: <error>`). Also stores the AI-generated `summary`, `keywords` (JSON array), `timeline` (JSON array of `{date_or_year, event}`), and `entities` (JSON array) — i.e., the insight-extraction output is persisted directly on the document row.
- **`ChatMessage`** — belongs to a workspace and optionally a session. `role` is `"user"` or `"assistant"`. `content` is the raw text. `citations` is a JSON array of `{doc_id, filename}` pairs the answer was grounded in.

### 4.5 `models/schemas.py` — Pydantic API Schemas
Request/response DTOs mirroring the DB models, using `from_attributes = True` (Pydantic v2 ORM mode) so they can be built directly from SQLAlchemy objects:
- `WorkspaceCreate` / `WorkspaceResponse`
- `SessionCreate` / `SessionResponse`
- `DocumentResponse`, `SessionAssignRequest` (used to move a document between sessions)
- `ChatQueryRequest` (`workspace_id`, `query`, optional `session_id`, optional `doc_ids` list — allows scoping a question to specific documents)
- `ChatMessageResponse`

### 4.6 `api/v1/api.py` — Router Aggregation
Simply mounts two sub-routers under the versioned prefix:
- `/api/v1/workspaces` → `workspaces.py`
- `/api/v1/documents` → `documents.py`

---

## 5. API Endpoints — Full Behavior

### 5.1 Workspace & Session Endpoints (`workspaces.py`)

| Method & Path | Behavior |
|---|---|
| `POST /api/v1/workspaces/` | Creates a new `Workspace` row with a fresh UUID. |
| `GET /api/v1/workspaces/` | Lists all workspaces. |
| `POST /api/v1/workspaces/{workspace_id}/sessions` | Creates a `Session` under a workspace. If the workspace doesn't exist yet (e.g. a fresh `demo` workspace id used by the frontend's `/workspace/demo` link), it **auto-creates** a `Workspace` named `"Demo Workspace"` first — meaning the app is designed to work without an explicit workspace-creation step in the UI. |
| `GET /api/v1/workspaces/{workspace_id}/sessions` | Lists sessions for a workspace. |
| `PATCH /api/v1/workspaces/{workspace_id}/sessions/{session_id}` | Renames a session. |
| `DELETE /api/v1/workspaces/{workspace_id}/sessions/{session_id}` | **Cascading delete**, done manually in application code rather than relying purely on the ORM cascade: (1) deletes all `ChatMessage` rows for the session, (2) for every `Document` in the session — deletes its Pinecone vectors, deletes its file from disk, deletes the DB row, (3) deletes the `Session` row itself. If the session isn't found by primary-key lookup it falls back to a query-based lookup, and if still not found it returns a friendly "already deleted" message rather than a 404 — this makes the delete idempotent, which is useful for a UI that might double-fire a delete click. |

### 5.2 Document Endpoints (`documents.py`)

| Method & Path | Behavior |
|---|---|
| `POST /api/v1/documents/upload` | Core ingestion entrypoint — see Section 6.1 for the full flow. |
| `POST /api/v1/documents/{doc_id}/retry` | Resets a document's status to `pending` and re-queues the same background processing task — used when processing previously failed. |
| `PATCH /api/v1/documents/{doc_id}/rename` | Renames a document (display filename only, not the physical file). |
| `GET /api/v1/documents/workspace/{workspace_id}` | Lists all documents in a workspace (any session). |
| `PATCH /api/v1/documents/{doc_id}/session` | Reassigns a document to a different session (or `null` to unassign). Validates the target session exists. |
| `POST /api/v1/documents/query` | Core chat/Q&A entrypoint — see Section 6.2. |
| `DELETE /api/v1/documents/{doc_id}` | Deletes a document: removes its vectors from Pinecone, deletes the physical file, deletes the DB row. |
| `GET /api/v1/documents/session/{session_id}/messages` | Returns full chat history for a session, ordered oldest-first — this is how chat persists across page reloads/logins. |
| `GET /api/v1/documents/session/{session_id}/documents` | Lists documents scoped to one session. |

---

## 6. The Two Core Flows, Step by Step

### 6.1 Document Upload & Processing Flow

1. **Frontend** sends a `multipart/form-data POST` to `/api/v1/documents/upload` with `workspace_id`, optional `session_id`, and the file itself.
2. **Backend** generates a `doc_id` (UUID), determines the file extension, and writes the raw file to `storage/docs/{doc_id}.{ext}` — note the file is renamed to its UUID on disk, so the original filename is preserved only in the DB row, not the path.
3. It looks up (or auto-creates) the `Workspace`, and if a `session_id` was given but doesn't exist yet, auto-creates a placeholder `Session`.
4. A `Document` row is inserted with `status="pending"`.
5. A **FastAPI `BackgroundTask`** (`process_document_background`) is scheduled — the HTTP response returns **immediately** with the pending document object, so the upload call doesn't block on processing. This is what powers the frontend's "processing status" UI (poll or refetch to see status change).
6. Inside the background task (runs after the response is sent, in-process):
   - Status → `"processing"`.
   - `DocumentProcessor.extract_text_and_chunks()` is called — see Section 6.3 for per-format details. Returns `pages` (list of `{page, text}`, one entry per page/sheet/slide/image) and `chunks` (the same content re-split for embedding).
   - Chunks are embedded and upserted into Pinecone via `vector_store.add_document_chunks()`. A failure here is caught and logged as a warning **without failing the whole document** — the document can still be summarized and directly-quoted even if vector indexing partially fails.
   - The full extracted text (`pages` joined together) is passed to `rag_service.generate_document_insights()`, which runs the **ingestion LangGraph** to produce `{summary, keywords, timeline, entities}`. If this fails, a minimal fallback summary is constructed from the filename and page count instead of failing the whole document.
   - Status → `"completed"`; `page_count`, `summary`, `keywords`, `timeline`, `entities` are all written to the `Document` row.
   - Any unhandled exception anywhere in this task sets `status = f"failed: {str(e)}"` so the frontend can surface the actual error.

### 6.2 Chat / Query Flow (`POST /api/v1/documents/query`)

This is the most involved endpoint — it layers **four separate retrieval strategies** before generation, to maximize the chance of finding relevant context even if vector search alone would miss it:

1. **Scope resolution.** All documents in the workspace are fetched, then narrowed: if `doc_ids` were explicitly passed, scope to exactly those; else if `session_id` was passed, scope to that session's documents (falling back to *all* workspace documents if the session happens to have none — avoids a dead-end empty context).
2. **Filename targeting.** The query text is scanned for any scoped document's filename or base name (e.g., a query mentioning `"agile.png"` or `"Requirements"`). Any match is treated as a **high-priority target**: the file is re-read from disk and re-extracted live (not from the vector store), and up to its first 6 pages are added directly as context snippets. This guarantees that if a user explicitly names a file, its content is used even if the vector index missed it.
3. **Vector similarity search.** `pinecone_store.query()` is called with the user's query text, `top_k=8`, and a metadata filter restricting results to `workspace_id` and (if scoped) the relevant `doc_id`s. Results are normalized (Pinecone's nested list format) into flat snippet strings like `"[filename - Page N]: <text>"`, deduplicated against what filename-targeting already added.
4. **Direct-file fallback.** If after both strategies there are still zero snippets but scoped documents exist, the first 4 scoped documents are read directly from disk and their first 3 pages each are added as raw context — a last-resort guarantee that *something* is passed to the LLM rather than returning "no context found" when documents clearly exist.
5. **Generation.** All collected snippets go to `rag_service.generate_query_answer()`, which runs the **query LangGraph** (see Section 6.4) → ultimately Groq.
6. **Persistence.** Both the user's question and the assistant's answer are saved as `ChatMessage` rows (with the assistant message carrying a `citations` list built from the top 4 result metadatas plus any filename-targeted docs), so history survives reloads via the `GET .../session/{id}/messages` endpoint.
7. **Response.** Returns `{answer, results: {documents, metadatas}}` — the raw vector-search hits are included alongside the generated answer, presumably so the frontend could show source snippets if desired.

### 6.3 Document Parsing — Format-by-Format (`document_processor.py`)

`DocumentProcessor.extract_text_and_chunks(file_path, file_type)` dispatches by extension:

- **PDF** — PyMuPDF (`fitz`) extracts text page by page. If a page's extracted text is under 30 characters (i.e. likely a scanned image), it renders the page to a PNG and runs **Tesseract OCR** (`pytesseract`) as a fallback, keeping whichever result is longer.
- **DOCX** — `python-docx` extracts all non-empty paragraph text plus all table rows (cells joined with `|`), concatenated into one "page."
- **XLSX/XLS/CSV** — `pandas` reads the file (with an encoding fallback to `latin1` for CSV, and an `openpyxl`-engine-first with a plain fallback for Excel). Each sheet becomes its own "page." Rather than dumping raw rows, `_format_dataframe()` builds a **structured text summary**: row/column counts, column names, min/max/mean for numeric columns (up to 6), and the table itself as a Markdown table (capped at 150 rows with a truncation note). This structured format is what lets the LLM later "compute" or explain tabular data in natural language instead of echoing a CSV back.
- **Images (PNG/JPG/JPEG/WEBP/BMP/TIFF)** — Pillow reads dimensions; Tesseract OCR extracts any visible text. The "page" text combines a description (`"Image Attachment: X (Dimensions: WxH px, Format: EXT)"`) with the OCR output, or a generic "ready for visual inquiry" note if OCR finds nothing.
- **PPTX** — `python-pptx` walks every slide, pulling text from all shapes, flattening any tables (`|`-joined rows), and appending speaker notes if present. Each slide is its own "page," labeled `"Slide N of Total"`.
- **HTML/HTM** — `BeautifulSoup` strips tags and returns plain text.
- **Everything else** (txt, md, json, etc.) — read as raw UTF-8 text (errors ignored) — one page.
- Any exception during extraction is caught at the top level and turned into a placeholder page containing the error message, so a single failing document doesn't crash the endpoint.

**Chunking (all formats, after page extraction):** each page's text is run through `RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)` from LangChain, producing overlapping ~1000-character chunks tagged with their originating page number and a per-page chunk index. These chunks — not the raw pages — are what gets embedded and stored in Pinecone.

### 6.4 The LangGraph Pipelines (`graph/`)

DocuMind uses **LangGraph's `StateGraph`** to make the RAG and insight-generation pipelines explicit, typed, and independently testable, rather than calling service functions directly inline.

**`state.py`** defines two `TypedDict` state shapes:
- `RAGState` — `query`, `workspace_id`, `doc_ids`, `snippets`, `metadatas`, `answer`
- `IngestionState` — `full_text`, `insights`

**`nodes.py`** defines the graph node functions:
- `retrieve_node` — takes a `RAGState`, queries Pinecone (unless `workspace_id == "bypass"` and snippets were pre-supplied — see below), formats results into citation-style snippet strings, returns the updated state.
- `generate_node` — calls `groq_client.generate_answer(query, snippets)`, writes the result into `state["answer"]`.
- `synthesize_node` — currently a pass-through (reserved for a future formatting/post-processing step).
- `insights_node` — calls `insights_extractor.generate_document_insights(full_text)` for the ingestion pipeline.

**`workflow.py`** wires two compiled graphs:
- `query_graph`: `retrieve → generate → synthesize → END`
- `ingestion_graph`: `insights → END`

**`rag_service.py`** is the bridge between the plain API endpoint code and these graphs:
- `generate_document_insights(full_text)` invokes `ingestion_graph`; on any exception, it falls back to calling `insights_extractor` directly (bypassing the graph).
- `generate_query_answer(query, snippets)` invokes `query_graph`, but with a **notable shortcut**: it sets `workspace_id: "bypass"` in the initial state. `retrieve_node` checks for exactly this sentinel and, when present, **skips its own Pinecone query** and uses the `snippets` already passed in. This is because by the time `generate_query_answer` is called from `documents.py`'s `/query` endpoint, all four retrieval strategies (filename targeting, vector search, direct-file fallback) have already run and produced a final snippet list — the graph's `retrieve_node` doing a *second*, redundant vector search would be wasteful and could overwrite better context with worse. In other words: **the graph's own retrieval step is currently only exercised in a hypothetical direct-call path; the actual API route pre-computes retrieval itself and feeds the graph pre-assembled snippets**, using the graph purely for the generation step. On any graph exception, it falls back to calling `groq_client.generate_answer` directly.

### 6.5 Vector Store (`pinecone_store.py`)

- On construction, connects to Pinecone with the API key; loads the embedding model `BAAI/bge-small-en-v1.5` (a 384-dimension sentence-transformer) locally (embedding happens in the backend process, not via a hosted embedding API).
- If the configured index (`docmind-index` by default) doesn't exist, creates it as a **serverless** index (AWS, `us-east-1`, cosine metric), polling until Pinecone reports it ready.
- `add_document_chunks()` — encodes all chunk texts in one batch, builds one vector per chunk with `id = "{doc_id}_{chunk_index}"` and metadata `{workspace_id, doc_id, filename, page, text}` (the raw chunk text is stored *in* the metadata so it can be returned directly by a query without a second lookup), and upserts in batches of 100.
- `query()` — embeds the query text, builds a metadata filter (`workspace_id` always; `doc_id` or `doc_id: {"$in": [...]}` if scoping to specific documents), and returns results reshaped into a Chroma-compatible nested-list structure (`{documents: [[...]], metadatas: [[...]], distances: [[...]]}`) — this is a deliberate compatibility shim, confirming the **project originally used ChromaDB and was migrated to Pinecone** without changing the calling code's expected shape (consistent with the stale `chroma_db` folder and `vector_store.cpython-314.pyc` seen in the structure listing).
- `delete_document_chunks()` — deletes by metadata filter (`{"doc_id": doc_id}`), which Pinecone serverless indexes support.

### 6.6 LLM Answer Generation (`groq_client.py`)

- Wraps the Groq SDK client. Primary model: `openai/gpt-oss-120b`, with fallbacks `openai/gpt-oss-20b` and `groq/compound` — if a model call throws, it's caught and the next model in the list is tried.
- **`detect_query_intent()`** — simple keyword-based classifier over the raw query text, returning `"short"` (keywords like "brief," "tldr," "summary"), `"detailed"` ("comprehensive," "step by step," "elaborate"), or `"standard"` (default). This intent controls both the system prompt's length instruction and (in the fallback path) how many sentences get selected.
- **`generate_answer(query, snippets)`** — if there are no snippets at all, short-circuits with a "no relevant content found" message (never calls the LLM on empty context). Otherwise builds a detailed system prompt that:
  - Identifies the assistant as "DocuMind AI, an enterprise-grade document intelligence assistant."
  - Gives format-specific grounding instructions (cite page/slide/sheet numbers; for spreadsheets, explicitly **forbids dumping raw tables/CSV back to the user** and requires synthesized natural-language answers instead; for images, ground answers in OCR text).
  - Instructs it to state what's missing rather than hallucinate when context is incomplete.
  - Injects the length instruction from the detected intent.
  - Sends the system prompt + `"User Query: ... \n\n Document Passages: ..."` (top 10 snippets) to Groq's chat completion endpoint, trying each model in the fallback list until one succeeds.
- **`_local_fallback_answer()`** — if Groq is unavailable entirely (no API key) or every model call fails, falls back to a **pure local extractive-summarization heuristic**: tokenizes the query into words, splits all snippets into sentences, scores each sentence by word-overlap with the query, and returns the top-scoring sentences (count and formatting depend on intent: 2 sentences for "short," up to 6 as bullets for "detailed," 3 for "standard"). This means the app can produce *some* answer even with zero LLM connectivity, degrading gracefully rather than erroring out.

### 6.7 Insight Extraction (`insights_extractor.py`)

- **`generate_document_insights(full_text)`** — if a Groq client is available, sends the first 12,000 characters of the document's full text with a prompt instructing the model to return **strict JSON** (`response_format={"type": "json_object"}`) containing `summary`, `keywords` (4–8 capitalized terms), `timeline` (date/event pairs, or empty), and `entities` (or empty). It tries the primary model then each fallback model in turn, parsing and validating the JSON has the required keys before accepting it.
- **`_extract_nlp_insights()`** (fallback, used if Groq is unavailable or every model/parse attempt fails) — a fully local, dependency-light NLP heuristic:
  - Builds a stopword-filtered word-frequency count (`collections.Counter`) over the whole document.
  - **Keywords**: top 8 most frequent non-stopword terms, capitalized.
  - **Summary**: splits text into sentences, scores each sentence by summed word-frequency of its own words, and joins the top 3 highest-scoring sentences — a classic extractive-summarization approach (similar in spirit to TextRank/Luhn's algorithm, but frequency-based rather than graph-based).
  - **Timeline**: regex-matches 4-digit years (1900s/2000s) or `"Month DD, YYYY"` patterns, deduplicated, capped at 4 entries.
  - **Entities**: regex-matches capitalized word sequences (a lightweight proper-noun heuristic — not real NER), filtered against stopwords and length, capped at 6.

---

## 7. Frontend — File-by-File Breakdown

### 7.1 `app/layout.tsx` — Root Layout
Sets the page `<html>`/`<body>` shell, global metadata (title "DocuMind – Enterprise RAG Workspace"), and renders two components on *every* page: `<BackgroundVideo />` (full-viewport looping video, `z-index: -1`) and `<Navbar />`, before `{children}`.

### 7.2 `components/Background/BackgroundVideo.tsx`
Plays a looping, muted, full-screen HLS video (hosted on Mux) as the site's persistent background. Uses `hls.js` if the browser doesn't natively support HLS (`Hls.isSupported()` check first, native `<video>` fallback for Safari via `canPlayType('application/vnd.apple.mpegurl')`). Because browsers block un-muted/sometimes even muted autoplay, it attempts to play immediately on mount *and* re-attempts on the user's first `pointerdown`/`keydown`/`touchstart` anywhere on the page (each listener removes itself after firing once).

### 7.3 `components/Navbar.tsx`
Client component (`'use client'`). Fixed-position header with the "DocuMind" logo linking home, desktop nav links (Product/Pricing/About/Launch), and a hamburger menu for mobile that toggles a glassmorphic dropdown panel. All nav items are static `Link`s — no auth state, no user menu (consistent with your memory notes: no auth system yet).

### 7.4 `components/landing/CtaFooter.tsx`
A closing call-to-action section used on the homepage: large heading, "Book a Call" / "View Pricing" buttons, and a footer bar with copyright + Privacy/Terms/Contact links (currently placeholder `#` anchors, not wired to real pages).

### 7.5 Marketing Pages (`app/page.tsx`, `app/about/page.tsx`, `app/pricing/page.tsx`, `app/product/page.tsx`)
All four are **static server components** (no `'use client'`, no data fetching) — pure marketing copy describing DocuMind's positioning ("Enterprise RAG for Document Teams"), feature highlights (session isolation, flexible ingestion, vector retrieval, document-first chat), and a 3-tier pricing table (Starter/Growth/Enterprise — display-only, no real billing integration). Every page's primary CTA links to `/workspace/demo`, which is how a visitor reaches the actual product without going through a workspace-creation step — matching the backend's auto-create-workspace-on-first-use behavior in `workspaces.py`.

### 7.6 `app/globals.css`
Imports Google Fonts (Instrument Serif for headings, Barlow for body text). Defines the signature `.liquid-glass-strong` utility class used throughout: semi-transparent white background, heavy `backdrop-filter: blur(30px)`, a subtle gradient border achieved via a `::before` pseudo-element with a `mask-composite: exclude` trick (renders only the border, not the fill). Also defines thin, dark custom scrollbars (both Firefox `scrollbar-color` and WebKit `::-webkit-scrollbar`) applied globally and via a `.workspace-scroll` convenience class — clearly added specifically for the workspace page's multiple independently-scrolling panes (chat, document list, insights).

### 7.7 `app/workspace/[workspaceId]/page.tsx` — ⚠️ PENDING
**This file's content was not received** — only its path came through in the upload, not the actual code. This is the single most important frontend file: based on your memory notes and the backend endpoints it must call, it's responsible for:
- Session sidebar (create/rename/delete via `workspaces.py`'s session endpoints)
- Document upload UI (drag-and-drop, likely via `react-dropzone`) hitting `POST /documents/upload`
- Processing-status polling/display (reading each document's `status` field)
- The chat panel — sending queries to `POST /documents/query`, rendering markdown answers (`react-markdown`), showing citations
- The insights/keywords side panel, sourced from each document's `summary`/`keywords`/`timeline`/`entities`
- Likely where `zustand` (client state) and `react-query` (server-state caching/polling) actually get used

**Please resend this file** and I'll add a full Section 7.7 write-up covering its component structure, state management, and exactly how it wires into each backend endpoint — completing the document end-to-end.

### 7.8 `package.json` — Dependency Notes
- **Next.js 15 / React 19** — current-generation App Router stack.
- **`react-dropzone`** — drag-and-drop file upload (used, presumably, in the pending workspace page).
- **`react-markdown`** — renders the LLM's Markdown-formatted answers (bullets, bold, headers) as real HTML rather than raw text — matches `groq_client.py`'s explicit instruction to the LLM to use Markdown formatting.
- **`recharts`** — charting library; possible use in a future analytics view, or for the timeline/keyword visualizations mentioned in your project's insights feature.
- **`zustand`** + **`@tanstack/react-query`** — client state and async server-state management, respectively.
- **`clsx` + `tailwind-merge`** — conditional/merged Tailwind class composition, standard companions for component libraries with variant styling.
- Dev dependency versions show a mismatch worth flagging: `react`/`react-dom` are `^19.0.0` but `@types/react`/`@types/react-dom` are pinned to `^18.2.0` — this can cause TypeScript type errors on React 19-only APIs and is worth bumping to `@types/react@^19`.

---

## 8. End-to-End Data Flow Summary

**Uploading a document:**
`Dropzone (frontend) → POST /documents/upload → file saved to disk + Document row (pending) → HTTP response returns immediately → [background] extract_text_and_chunks → embed + upsert to Pinecone → generate_document_insights (ingestion_graph → Groq or local NLP fallback) → Document row updated (completed, summary, keywords, timeline, entities)`

**Asking a question:**
`Chat input (frontend) → POST /documents/query → scope documents (by doc_ids/session) → filename-targeting direct extraction + Pinecone vector search + direct-file fallback → merged snippet list → rag_service.generate_query_answer (query_graph → generate_node → Groq or local extractive fallback) → answer + citations → ChatMessage rows persisted (user + assistant) → JSON response → rendered as Markdown in chat`

**Deleting a session:**
`Delete click → DELETE /workspaces/{id}/sessions/{id} → delete all ChatMessages → for each Document: delete Pinecone vectors, delete file from disk, delete DB row → delete Session row`

---

## 9. Notable Design Decisions & Migration History

- **Chroma → Pinecone migration**: `pinecone_store.py`'s `query()` method deliberately reshapes Pinecone's response into ChromaDB's nested-list format, and stale `chroma_db`/`vector_store.pyc` artifacts remain in the project structure — the vector store was originally ChromaDB and was swapped for Pinecone without changing the calling code's expected data shape.
- **Gemini → Groq migration**: `config.py` keeps a `GEMINI_API_KEY` setting marked `# DEPRECATED: Moving to Groq`, and a stale `gemini_service.cpython-314.pyc`/`llm_generator.cpython-314.pyc` remain in `__pycache__` — the LLM provider was originally Gemini and was swapped for Groq.
- **Graceful degradation everywhere**: both the LLM call (`groq_client.py`) and the insight extraction (`insights_extractor.py`) have full local, non-LLM fallback implementations (extractive summarization / word-frequency keyword extraction) — the app is designed to keep functioning, in a degraded form, even with no Groq API key or connectivity.
- **LangGraph is currently a thin orchestration layer** rather than a multi-step agentic pipeline: the query graph's own retrieval node is effectively bypassed in the real API path (see Section 6.4) because retrieval already happens in `documents.py` before the graph is invoked. The graph currently formalizes "generate" as a single node, with `synthesize` reserved but unused — there's clear room to extend this (e.g., a real synthesis/formatting pass, or a re-ranking node) without changing the calling code, since `rag_service` is the only integration point.
- **Idempotent deletes**: session deletion returns a success-like message even when the session doesn't exist, rather than a 404 — a deliberate UX choice to tolerate double-clicks/retries from the frontend.

---

*Document generated from source review of the backend (`app/`) and frontend (`src/`) directories as of the files provided. Section 7.7 (workspace page) to be completed pending that file's content.*
