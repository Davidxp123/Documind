# DocuMind: Render Deployment (Single Service, Backend Serves Frontend)

You are working on **DocuMind**: Next.js frontend in `frontend/`, FastAPI backend in `backend/`, Supabase Auth/Postgres, Pinecone, Groq. Read this entire file before touching anything.

## 1. Goal

Deploy DocuMind to **Render as ONE web service** where the deployable unit is only the `backend/` folder (Render Root Directory = `backend`). After deploy:

1. FastAPI serves the **pre-built static frontend** (Next.js static export) at `/`.
2. The API keeps working exactly as today, including the `/api/...` URLs the frontend already uses.
3. A **keep-alive heartbeat** (no DB access) is built into `backend/app/main.py` and starts automatically with the server.

Local development must keep working unchanged: `npm run dev` in `frontend/` (with its `/api` proxy to `127.0.0.1:8000`) and `uvicorn` in `backend/`.

## 2. Hard rules

- **Do NOT change UI, styling, theme, layout, or any user-visible behavior.** Only make the changes needed for static export and serving.
- Do not delete existing files or features. Prefer small, additive edits.
- Never print, log, or commit secrets. Read `.env` / `.env.local` only to list variable **names**.
- If something cannot be done without changing existing behavior, **stop that item and report it**; do not improvise.
- Work in the phases below, in order, and verify after each.

## 3. Current state (already inspected, treat as facts)

**`backend/app/main.py`**
- Creates `FastAPI(title=settings.PROJECT_NAME)`, CORS with `allow_origins=["*"]` and `allow_credentials=True`.
- Uses the deprecated `@app.on_event("startup")` to `os.makedirs` for `settings.DOCS_DIR`, `settings.CHROMA_DIR`, `STORAGE_DIR/sqlite`, then `await init_db()`.
- Includes `api_router` with `prefix=settings.API_V1_STR`.
- Defines `@app.get("/")` returning `{"status": "DocMind AI Workspace Backend Running"}`. **This conflicts with serving the frontend at `/`.**

**`frontend/next.config.mjs`**
- `reactStrictMode: true` and a `rewrites()` mapping `/api/:path*` → `http://127.0.0.1:8000/api/v1/:path*`.
- So the frontend calls **`/api/<path>`**, and the proxy turns that into `/api/v1/<path>`. Rewrites are NOT supported with `output: 'export'` and do not exist in production, so the backend itself must accept `/api/<path>` (see Phase 3).

**`frontend/src/app/auth/callback/route.ts`**
- A server route handler using `createServerClient` from `@supabase/ssr` with `next/headers` cookies.
- Reads `code` and `next` from the query string. `next` is validated (must start with `/`, not `//`) and defaults to `/workspace`.
- Calls `exchangeCodeForSession(code)`; on success redirects to `origin + next`.
- On failure: if `next === '/reset-password'` redirect to `/reset-password?error=invalid_or_expired`, otherwise redirect to `/workspace`.
- Route handlers are not supported with `output: 'export'`, so this must become a client page at the same URL.

## 4. Phase 0: Audit (no edits)

Read and summarize in the final report:

- `frontend/package.json`, `frontend/tsconfig.json`
- `frontend/src/lib/supabase/client.ts` (is it `createBrowserClient` from `@supabase/ssr`? any `detectSessionInUrl`/flow options?), `frontend/src/context/AuthContext.tsx`
- `frontend/src/app/workspace/page.tsx` and `frontend/src/app/workspace/[workspaceId]/page.tsx` (how the ID is read: `useParams`, props, etc.)
- `frontend/src/app/reset-password/` (and any other page/route using `cookies()`, `headers()`, server actions, `middleware.ts`, or `src/app/api` routes)
- Every place the frontend calls the backend: confirm they all use relative `/api/...` and that no URL hardcodes `127.0.0.1:8000`
- `backend/app/core/config.py` (value of `API_V1_STR`, `PROJECT_NAME`, storage dirs), `backend/app/api/v1/api.py`, `backend/requirements.txt`, `backend/.env` (names only)
- `.gitignore` files, and whether `backend/storage/` is tracked
- Two Tailwind configs exist (`tailwind.config.js` and `.ts`): leave alone unless the build fails because of them, then report.

## 5. Phase 1: Make the frontend statically exportable

Static export outputs `out/` (not `public/`; `frontend/public` is just source assets). We copy `out/` into `backend/public/`.

1. **`next.config.mjs`**: keep `reactStrictMode: true`. Make config depend on the environment so local dev is untouched:
   - `NODE_ENV === 'production'` (i.e. `next build`): add `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`, and **no** `rewrites`.
   - otherwise (`next dev`): keep the existing `rewrites` exactly as they are.
   Note `next start` will no longer apply in production mode; that is expected, the backend serves the files.
2. **`auth/callback`**: delete `route.ts` and replace it with a **client page** `src/app/auth/callback/page.tsx` at the same URL (keeps Supabase and Google redirect settings valid).
   - Use the existing browser Supabase client. Wrap `useSearchParams` in `Suspense`.
   - Preserve the exact logic: read `code`, read `next`, keep the same open-redirect validation, call `exchangeCodeForSession(code)`, redirect to `next` on success, and on failure apply the same fallbacks (`/reset-password?error=invalid_or_expired` when `next === '/reset-password'`, else `/workspace`).
   - Redirect with `window.location.replace(...)` so the auth context reloads with the new session.
   - **Watch for double exchange**: if the browser client has `detectSessionInUrl` enabled it may consume the `code` on its own. Make sure exactly one exchange happens (for example check for an existing session first, and treat "already exchanged" as success if a session exists). Make sure the PKCE code-verifier cookie is readable by the browser client.
   - Show a minimal neutral "Signing you in..." state using existing styles/components only (no new design).
3. **Dynamic route `workspace/[workspaceId]`**: static export cannot pre-render arbitrary IDs. Use the approach with the least visible change. Preferred: keep the URL shape `/workspace/<id>`, export it with `generateStaticParams` returning a single placeholder param and `dynamicParams = false`, have the backend serve that placeholder HTML for any `/workspace/<id>` path (Phase 3), and make the client read the real ID from `window.location`/`usePathname` (NOT `useParams`, which would return the placeholder). If `workspace/[workspaceId]/page.tsx` is a client component, you may need to split a thin server wrapper (exporting `generateStaticParams`) from the existing client component without changing its contents. If you choose query-param routing instead, update every link/redirect and wrap `useSearchParams` in `Suspense`. Explain the choice in the report.
4. Convert any other server-only feature found in Phase 0 to client-only. Auth must work purely client-side with the Supabase browser client. The `/reset-password` page must also be client-only.
5. **API calls**: keep them relative (`/api/...`). Do not introduce a new base-URL variable unless Phase 0 found hardcoded hosts; if so, replace them with relative paths.
6. `NEXT_PUBLIC_*` values are baked in at build time. Confirm `frontend/.env.local` holds only public values (Supabase URL and anon key).
7. Run `npm run build` in `frontend/` and fix only export-related errors.

## 6. Phase 2: Build script that feeds the backend

Create a repo-root, cross-platform **Python** script `build_frontend.py` (the developer may be on Windows) that:

1. Runs `npm ci` then `npm run build` in `frontend/`
2. Deletes `backend/public/` if present, then copies the contents of `frontend/out/` into `backend/public/`
3. Prints a short success message with the file count and fails loudly if `out/index.html` is missing

Rules:
- `backend/public/` **must be committed to git**: Render deploys only `backend/` and will not run a Node build. Make sure no `.gitignore` rule ignores it (while `frontend/out`, `frontend/.next`, and `node_modules` stay ignored).
- Add a "Deploy workflow" section to `README.md`: run `python build_frontend.py`, commit `backend/public`, push, Render auto-deploys.

## 7. Phase 3: FastAPI serves the frontend (`backend/app/main.py`)

Keep all existing behavior (CORS stays as is, the same startup work, same `api_router`).

1. **Lifespan**: replace `@app.on_event("startup")` with a `lifespan` context manager (note: when `lifespan` is set, `on_event` handlers are ignored, so the existing startup code must move into it). Same order as today: the three `os.makedirs` calls, then `await init_db()`, then start the keep-alive task (Phase 4), then `yield`, then cancel the task on shutdown.
2. **Remove the JSON `@app.get("/")` route** (it would shadow the frontend). If a status check is wanted, `/health` covers it.
3. **Accept `/api/<path>` as well as `/api/v1/<path>`**: the frontend calls `/api/<path>` and the dev proxy maps it to `/api/v1/<path>`, which does not exist in production. Keep `include_router(api_router, prefix=settings.API_V1_STR)` and ALSO include the same router under prefix `/api` with `include_in_schema=False` (or an equivalent small path-rewrite middleware). Verify there is no route conflict, and that every endpoint the frontend uses works via `/api/...` in production mode.
4. Register routers, `/docs`, `/openapi.json`, and `/health` **before** the static handling. The static catch-all must never shadow `/api/*`; unknown `/api/...` paths should return a normal JSON 404.
5. Resolve the public dir as `Path(__file__).resolve().parents[1] / "public"`, never the working directory.
6. Mount `/_next` with `StaticFiles` from `public/_next`. Serve other top-level files (images, video, favicon, etc.) from `public/`.
7. Add a catch-all `GET` handler, registered last, that resolves in this order: exact file → `<path>/index.html` → `<path>.html` → the workspace placeholder page for `/workspace/<id>` (if Phase 1 used that approach) → `404.html` with status 404 (or `index.html` if absent). Guard against path traversal (resolve and verify the target stays inside `public/`).
8. If `public/` is missing, log a clear warning and keep the API fully functional (do not crash).

## 8. Phase 4: Heartbeat / keep-alive (in `main.py`)

1. Add `GET /health` (also answering `HEAD`) returning `{"status": "ok"}`. **No database, Supabase, or Pinecone calls.**
2. Add a background asyncio task, started in `lifespan`, that every `KEEPALIVE_INTERVAL_SECONDS` seconds (**default 600 = 10 minutes**) sends a GET to `{RENDER_EXTERNAL_URL}/health`.
   - `RENDER_EXTERNAL_URL` is set automatically by Render. If it is not set (local dev), do not start the task.
   - Use a lightweight HTTP client already in `requirements.txt` (`httpx` if present; otherwise `urllib` in a thread so the event loop is not blocked). Add a dependency only if truly needed.
   - Wrap each ping in try/except, log failures at warning level, and continue. The loop must never crash the app, and must cancel cleanly on shutdown.
3. **Important:** Render's free tier spins a service down after **15 minutes** without inbound traffic, so a 1-hour interval would NOT keep it awake. The interval must stay **under 15 minutes**. Add a note to `README.md` that a self-ping cannot wake an already-sleeping instance, so a free external pinger (UptimeRobot or cron-job.org hitting `/health` every 5-10 minutes) is recommended as a backup.

## 9. Phase 5: Render readiness

1. Review `backend/requirements.txt`: it must install cleanly on Linux and list every package the app imports. Local `__pycache__` shows Python 3.14; check that all pinned packages support the Python version Render will use, and recommend a `PYTHON_VERSION` env var (for example a 3.12.x release) if not.
2. The storage directories are already created at startup (keep that). Make sure runtime data under `backend/storage/` (docs, sqlite, chroma) is not committed.
3. **Ephemeral disk**: Render's free filesystem is wiped on every redeploy/restart. Report exactly which features still depend on local disk (uploaded files, SQLite, Chroma) versus Supabase/Pinecone. Do not re-architect; just report.
4. **OCR**: image uploads use Tesseract, which is not installed on Render's native Python environment. Make sure image upload fails **gracefully with a clear error** (no crash, no endless "processing" state) when Tesseract is missing. Report the limitation; a Docker-based deploy would be the real fix and is out of scope.
5. Document in `README.md` the Render settings:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health Check Path: `/health`
   - Environment variables: the **names** found in `backend/.env` (no values), plus `PYTHON_VERSION` and optional `KEEPALIVE_INTERVAL_SECONDS`

## 10. Verification (run locally before reporting)

1. Dev mode still works: `npm run dev` in `frontend/` plus `uvicorn` in `backend/`, with `/api` proxying as before.
2. Run `python build_frontend.py`: `backend/public/` exists with `index.html` and `_next/`.
3. From `backend/`, run `uvicorn app.main:app --port 8000` (no Next dev server) and confirm:
   - `/` shows the landing page, and `/login`, `/signup`, `/about`, `/pricing`, `/product`, `/workspace`, `/reset-password` load
   - A hard refresh on `/workspace/<some-id>` loads the workspace and fetches the correct data
   - The frontend's `/api/...` calls succeed (sessions, documents, upload, chat), `/api/v1/...` and `/docs` still respond, and `/health` returns `{"status":"ok"}`
   - Email login, Google login, `/auth/callback` (including the reset-password link flow and its error fallback) work
4. Simulate keep-alive with `RENDER_EXTERNAL_URL=http://localhost:8000` and `KEEPALIVE_INTERVAL_SECONDS=10`: pings show in the logs. With the variable unset, the task does not start.

## 11. Final report (required)

1. Every file created/modified/removed, one line each on why
2. The decisions made for `workspace/[workspaceId]`, `auth/callback`, and the `/api` vs `/api/v1` handling, and why
3. Anything that could not be done or behaves differently, including the ephemeral-storage and OCR findings
4. A **manual checklist for me**: add the Render URL to Supabase Auth → URL Configuration (Site URL and Redirect URLs, including `/auth/callback` and `/reset-password`) and to the Google OAuth authorized redirect settings; set environment variables in the Render dashboard; set up the external pinger