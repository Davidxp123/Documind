# DocuMind

**DocuMind** is a full-stack Retrieval-Augmented Generation (RAG) workspace for document intelligence. Upload documents into isolated workspaces and sessions, get instant AI-generated summaries, keywords, and timelines, and chat with your documents using answers grounded strictly in their content.

---

## ✨ Features

- **Session-based workspaces** — create, rename, and delete sessions to keep document collections and conversations isolated per project.
- **Multi-format ingestion** — PDF, DOCX, XLSX/XLS/CSV, PPTX, HTML, images (PNG/JPG/WEBP/BMP/TIFF), and plain text, all through a single upload flow.
- **OCR fallback** — scanned PDF pages and image attachments are run through Tesseract OCR when native text extraction comes up short.
- **Semantic search** — document chunks are embedded and stored in a Pinecone vector index for similarity-based retrieval.
- **Grounded AI chat** — answers are generated only from retrieved document context (via Groq), with citations back to the source file and page/slide/sheet.
- **Automatic insights** — every processed document gets an executive summary, keyword list, timeline, and named entities.
- **Graceful degradation** — if the LLM or vector store is unavailable, the app falls back to local extractive summarization and keyword-frequency heuristics instead of failing outright.
- **Persistent chat history** — conversations are stored per session and reloaded on return.

---

## 🏗️ Tech Stack

**Frontend**

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS (custom glassmorphic "liquid glass" design system)
- `react-dropzone`, `react-markdown`, `recharts`, `hls.js`, `zustand`, `@tanstack/react-query`

**Backend**

- FastAPI (async) + Uvicorn
- SQLAlchemy (async) + SQLite (`aiosqlite`)
- **LangGraph** for orchestrating the retrieval/generation and ingestion/insight pipelines
- **Groq** for LLM answer generation and insight extraction
- **Pinecone** (serverless) for vector storage/search
- `sentence-transformers` (`BAAI/bge-small-en-v1.5`) for local embedding generation
- PyMuPDF, `python-docx`, `pandas`/`openpyxl`, `python-pptx`, BeautifulSoup, Pillow + Tesseract OCR for document parsing
- LangChain's `RecursiveCharacterTextSplitter` for chunking

---

## 📁 Project Structure

```
documind/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── api.py                # Router aggregation
│   │   │   └── endpoints/
│   │   │       ├── workspaces.py     # Workspace + session CRUD
│   │   │       └── documents.py      # Upload, query, document CRUD
│   │   ├── core/
│   │   │   ├── config.py             # Settings / env loading
│   │   │   └── database.py           # Async SQLAlchemy engine + schema migration
│   │   ├── graph/
│   │   │   ├── state.py              # LangGraph state definitions
│   │   │   ├── nodes.py              # Graph node functions
│   │   │   ├── workflow.py           # Compiled query & ingestion graphs
│   │   │   └── __init__.py
│   │   ├── models/
│   │   │   ├── db_models.py          # SQLAlchemy ORM models
│   │   │   └── schemas.py            # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── document_processor.py # Format-specific text extraction + chunking
│   │   │   ├── pinecone_store.py     # Vector store client
│   │   │   ├── groq_client.py        # LLM answer generation
│   │   │   ├── insights_extractor.py # Summary/keyword/timeline/entity generation
│   │   │   └── rag_service.py        # Bridges API layer to LangGraph pipelines
│   │   └── main.py                   # FastAPI app entrypoint
│   ├── storage/                      # Uploaded files + SQLite DB (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout (nav + background video)
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── about/, pricing/, product/
│   │   │   └── workspace/[workspaceId]/page.tsx  # Main workspace UI
│   │   └── components/
│   │       ├── Navbar.tsx
│   │       ├── Background/BackgroundVideo.tsx
│   │       └── landing/CtaFooter.tsx
│   └── package.json
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq](https://console.groq.com/) API key
- A [Pinecone](https://www.pinecone.io/) API key
- Tesseract OCR installed and available on your system `PATH` (required for scanned PDFs and image uploads)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
GROQ_API_KEY=your_groq_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=docmind-index
```

Run the backend:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`, with interactive docs at `http://localhost:8000/docs`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

> **Note:** the frontend currently expects the backend at a fixed base URL — set this via your own environment variable / config as needed (e.g. `NEXT_PUBLIC_API_URL`).

---

## 🔄 How It Works

1. **Upload** — a document is uploaded to a workspace/session, stored on disk, and queued for background processing.
2. **Extraction** — text is extracted per format (with OCR fallback for scans/images) and split into overlapping chunks.
3. **Embedding** — chunks are embedded locally and upserted into Pinecone, scoped by workspace and document ID.
4. **Insight generation** — the full document text is summarized into an executive summary, keywords, timeline, and entities via Groq (with a local NLP fallback).
5. **Query** — a user's question is answered by combining filename-targeted extraction, vector similarity search, and a direct-file fallback into a single context set, which is passed to Groq for a grounded, cited answer.
6. **Persistence** — every question and answer is saved to the session's chat history.

---

