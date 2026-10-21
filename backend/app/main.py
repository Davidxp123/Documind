import os
import asyncio
import logging
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import init_db
from app.api.v1.api import api_router

logger = logging.getLogger("docmind.main")
logging.basicConfig(level=logging.INFO)

# Resolve public directory: backend/public
PUBLIC_DIR = Path(__file__).resolve().parents[1] / "public"


def _ping_url(url: str):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "DocuMind-KeepAlive/1.0"}
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return response.getcode()


async def keepalive_worker(url: str, interval_seconds: int):
    ping_url = f"{url.rstrip('/')}/health"
    logger.info("Keep-alive task started for %s with interval %ds", ping_url, interval_seconds)
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            status_code = await asyncio.to_thread(_ping_url, ping_url)
            logger.info("Keep-alive ping to %s succeeded (status %s)", ping_url, status_code)
        except asyncio.CancelledError:
            logger.info("Keep-alive task cancelled")
            break
        except Exception as e:
            logger.warning("Keep-alive ping to %s failed: %s", ping_url, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence: maintain existing order
    os.makedirs(settings.DOCS_DIR, exist_ok=True)
    os.makedirs(settings.CHROMA_DIR, exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "sqlite"), exist_ok=True)
    await init_db()

    # Phase 4: keep-alive heartbeat task
    keepalive_task = None
    render_external_url = os.getenv("RENDER_EXTERNAL_URL")
    if render_external_url:
        try:
            interval = int(os.getenv("KEEPALIVE_INTERVAL_SECONDS", "600"))
        except ValueError:
            interval = 600
        keepalive_task = asyncio.create_task(keepalive_worker(render_external_url, interval))
    else:
        logger.info("RENDER_EXTERNAL_URL not set; keep-alive task not started.")

    try:
        yield
    finally:
        # Shutdown
        if keepalive_task:
            keepalive_task.cancel()
            try:
                await keepalive_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Health check endpoint (GET and HEAD) - no DB, Supabase, or Pinecone calls
@app.get("/health", operation_id="health_check")
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

# 2. Routers: both /api/v1 (existing) and /api (for frontend production calls)
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/api", include_in_schema=False)

# 3. Mount static Next.js assets at /_next
if PUBLIC_DIR.is_dir():
    next_static_dir = PUBLIC_DIR / "_next"
    if next_static_dir.is_dir():
        app.mount("/_next", StaticFiles(directory=str(next_static_dir)), name="next_static")
else:
    logger.warning("Frontend public directory not found at %s. API running without static frontend.", PUBLIC_DIR)


# 4. Root handler: serve index.html
@app.get("/", include_in_schema=False)
async def serve_root():
    if not PUBLIC_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Frontend public directory not found")
    index_file = PUBLIC_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Index file not found")


# 5. Catch-all GET handler registered LAST
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    # Rule: unknown /api/... paths return JSON 404, never static fallback
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")

    if not PUBLIC_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Frontend public directory not found")

    clean_path = full_path.strip("/")
    if not clean_path:
        index_file = PUBLIC_DIR / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Index file not found")

    # Guard against directory traversal
    try:
        resolved_public = PUBLIC_DIR.resolve()
        resolved_target = (PUBLIC_DIR / clean_path).resolve()
        if not resolved_target.is_relative_to(resolved_public):
            raise HTTPException(status_code=403, detail="Forbidden")
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=403, detail="Forbidden")

    # 1. Exact file (e.g. favicon.ico, images, txt files)
    if resolved_target.is_file():
        return FileResponse(str(resolved_target))

    # 2. <path>/index.html (e.g. login/index.html)
    index_candidate = resolved_target / "index.html"
    if index_candidate.is_file():
        return FileResponse(str(index_candidate))

    # 3. <path>.html (e.g. login.html)
    html_candidate = resolved_target.with_suffix(".html")
    if html_candidate.is_file():
        return FileResponse(str(html_candidate))

    # 4. Dynamic workspace placeholder for /workspace/<workspaceId>
    parts = clean_path.split("/")
    if parts[0] == "workspace":
        placeholder = PUBLIC_DIR / "workspace" / "default" / "index.html"
        if not placeholder.is_file():
            placeholder = PUBLIC_DIR / "workspace" / "index.html"
        if placeholder.is_file():
            return FileResponse(str(placeholder))

    # 5. 404.html with status 404 (or index.html if absent)
    not_found_file = PUBLIC_DIR / "404.html"
    if not not_found_file.is_file():
        not_found_file = PUBLIC_DIR / "404" / "index.html"
    if not_found_file.is_file():
        return FileResponse(str(not_found_file), status_code=404)

    fallback_index = PUBLIC_DIR / "index.html"
    if fallback_index.is_file():
        return FileResponse(str(fallback_index), status_code=404)

    raise HTTPException(status_code=404, detail="Not found")
