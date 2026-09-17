# DocuMind — Phase: Supabase Auth + Persistent User Sessions

## Context (read this first)

DocuMind is an existing, working full-stack RAG (retrieval-augmented generation) application:

- **Frontend:** Next.js, glassmorphic dark UI (already finalized — do not redesign or restyle existing pages/components)
- **Backend:** FastAPI
- **Current functionality that already works and MUST continue working exactly as-is:**
  - Document upload/processing/removal for multiple file types (PDF, DOCX, CSV, PPTX, TXT, MD, images)
  - Processing status timeline (Upload Complete → Extraction → Embedding → Analysis → Ready)
  - Conversational AI assistant chat grounded in uploaded documents, with cited sources
  - Session management (create/rename/delete) — **currently local/in-memory, not tied to any user account or database**
  - Session Insights panel (executive summary + top keywords)
  - Document library per session
- **Current gap this phase closes:** there is no authentication. The app is fully public. Sessions are not persisted per user — anyone can see any session, and nothing survives across devices/logins.

## Goal of this phase

Add **Supabase (Auth + Postgres)** so that:

1. New users can register (email/password and Google OAuth).
2. Existing users can log in.
3. After login, the user lands on the workspace with a **sidebar listing their own previous sessions** (like Claude/ChatGPT history) — most recent first.
4. Clicking a previous session reopens it with its full chat history, documents, and insights intact — the user can continue the conversation exactly where they left off.
5. A user can never see, query, or access another user's sessions, documents, or messages — enforced at the database level, not just in application code.
6. All of this integrates with the **existing** session/document/chat logic — it should feel like the current local session behavior "just started remembering," not like a rebuilt app.

### Access model — what's public vs. what requires login

This is a mixed-access site, not an all-or-nothing gate:

- **Public, no login required:** the landing page, product page, pricing page, about page — anyone can browse the marketing site freely, same as today.
- **Add a "Log in" (or "Sign in") button/link to the existing top navigation bar**, visible on the public pages, styled consistently with the existing nav (matches the "Launch" button already there — this can replace or sit alongside it).
- **Requires login:** the workspace itself — document upload, chat, sessions, Session Insights. This is the only part of the app behind auth.
- If a logged-out user tries to reach the workspace directly (e.g. via the existing "Launch Workspace" button or a direct `/workspace` URL), redirect them to `/login` first. After a successful login or signup, send them straight into the workspace (not back to the landing page) so it feels like one continuous action, not two separate steps.
- A logged-in user visiting the public pages should still see them normally, but the nav should reflect that they're logged in (e.g. "Launch Workspace" / account menu instead of "Log in").

## Explicit non-goals for this phase (do NOT build these now)

- No clickable in-document citation jumping
- No cross-document synthesis/comparison
- No export-to-PDF/Markdown feature
- No auto-generated mind maps/flashcards
- No cross-session semantic search
- No confidence/grounding indicator on answers
- No changes to the visual design system, glassmorphism, colors, fonts, or landing/product/pricing/about pages
- No new document processing logic, no changes to the RAG pipeline itself, no changes to how answers are generated

These are planned for a later phase. Building them now is out of scope and should be flagged, not silently added.

## Hard constraint: do not regress existing functionality

Before starting, read through the existing codebase and understand how sessions, documents, and chat currently flow end to end. Every change in this phase must be additive:

- Document upload, processing, and the RAG chat pipeline must work identically to today, just now scoped to a `user_id` instead of being global/anonymous.
- The existing UI/UX for the chat panel, processing timeline, and Session Insights panel must be visually unchanged — only their **data source** changes (from local/in-memory state to Supabase-backed, user-scoped data).
- Do not remove or rewrite working RAG/ingestion code as part of this change. If a refactor is genuinely required to wire in `user_id`/`session_id` scoping, keep it minimal and localized.
- After implementation, the existing (pre-auth) core flows — upload a doc, ask a question, get a cited answer — must still work for a logged-in user exactly as they did before, just persisted now.

## Environment variables (already created — use these exact names, do not rename or duplicate)

Supabase project is already set up, Google OAuth is already configured, and the following env files already exist with real values in them. Read from these exact variable names — do not invent different names, and do not create a second/alternate env file:

- **Backend** — `.env` inside the backend/FastAPI project folder:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never read this into any frontend code or expose it via an API response)

- **Frontend** — `.env.local` inside the frontend/Next.js project folder (same folder as its `package.json`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Google sign-in is already enabled and configured in the Supabase dashboard (Authentication → Providers → Google), with redirect URLs already set for local dev (`http://localhost:3000`). No further Supabase dashboard configuration should be needed for this phase — if the implementation seems to require a dashboard change beyond what's listed here, flag it instead of assuming.

## What to build

### 1. Database schema (Supabase Postgres)

Create these tables (adapt field names to match what the existing code already uses wherever possible, to minimize churn):

- `sessions`
  - `id` (uuid, pk)
  - `user_id` (uuid, references `auth.users`, not null)
  - `name` (text)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz)

- `documents`
  - `id` (uuid, pk)
  - `session_id` (uuid, references `sessions.id`, not null)
  - `filename` (text)
  - `file_type` (text)
  - `status` (text — processing stage, matches existing timeline states)
  - `metadata` (jsonb — page count, size, OCR info, etc.)
  - `created_at` (timestamptz, default now())

- `messages`
  - `id` (uuid, pk)
  - `session_id` (uuid, references `sessions.id`, not null)
  - `role` (text — 'user' | 'assistant')
  - `content` (text)
  - `sources` (jsonb — citation metadata as currently produced by the chat pipeline)
  - `created_at` (timestamptz, default now())

Do not create a separate `users` table — Supabase's built-in `auth.users` is the source of truth for identity. Reference it via `user_id` foreign keys as above.

### 2. Row Level Security (RLS)

Enable RLS on `sessions`, `documents`, and `messages`.

- `sessions`: policy so a row is selectable/insertable/updatable/deletable only when `user_id = auth.uid()`.
- `documents` and `messages`: policy checks ownership via a join back to `sessions.user_id = auth.uid()` (since these tables don't have `user_id` directly).

This is the actual security boundary — application code should never be the only thing preventing cross-user access. Verify this with a real test (see Acceptance Criteria).

### 3. Frontend (Next.js)

- Add `/login` and `/signup` pages, styled consistently with the existing glassmorphic dark theme (reuse existing design tokens/components — do not introduce a new visual style).
  - Signup: email + password, plus "Continue with Google."
  - Login: email + password, plus "Continue with Google." Include a "forgot password" link (Supabase supports this out of the box).
- Use `@supabase/supabase-js` (and `@supabase/auth-helpers-nextjs` or the current recommended Next.js integration) for auth state and session handling on the client.
- Protect the `/workspace` routes only: unauthenticated users are redirected to `/login`. Public marketing pages (landing/product/pricing/about) must remain reachable without login, per "Access model" above.
- Add a "Log in" entry to the existing nav bar for logged-out visitors; swap it for the account menu / "Launch Workspace" when a session is active. Reuse the existing nav component/styling — don't introduce a new nav design.
- After login or signup succeeds, redirect straight into `/workspace` (not back to the landing page).
- In the workspace sidebar, replace the current local "Sessions" list with a query for the logged-in user's sessions (`SELECT * FROM sessions WHERE user_id = auth.uid() ORDER BY updated_at DESC`), rendered in the existing sidebar UI/styling — only the data source changes.
- Selecting a session loads its `documents` and `messages` from Supabase and renders them in the existing chat/document/insights panels — again, same UI, now backed by persisted data.
- "New Session" creates a row in `sessions` with the current user's `user_id`, then behaves as it does today.
- On first-ever login (no sessions yet), auto-create one default session so the workspace isn't empty, consistent with current first-load behavior.
- Add a simple account menu (user email + "Log out") wherever fits naturally into the existing header/workspace chrome without disrupting layout.

### 4. Backend (FastAPI)

- Add a dependency/middleware that reads the Supabase-issued JWT from the `Authorization: Bearer <token>` header on every protected request.
- Verify the token against Supabase's JWKS (or use the Supabase Python client's built-in verification) and extract `user_id`.
- Reject requests with missing/invalid tokens with a 401.
- Update existing endpoints (session create/list/delete, document upload/list/delete, chat/query) to scope all reads/writes by the authenticated `user_id`, using the same RLS-backed tables. Existing endpoint behavior/response shapes should stay the same wherever possible — only the scoping changes.
- Store Supabase URL, anon key, and service role key as environment variables (never hardcode). Service role key is backend-only, never exposed to the frontend.

### 5. Migration/compatibility note

If there is existing local/in-memory or file-based session data from the pre-auth version, it does not need to be migrated into Supabase — it's fine to start fresh once auth is live. Flag this assumption rather than silently deciding it.

## Acceptance criteria

- [ ] A new user can sign up with email/password and with Google, and lands on an empty (or default) workspace.
- [ ] An existing user can log in and see exactly their own previous sessions in the sidebar, most recent first.
- [ ] Opening a previous session restores its full chat history, its documents, and its Session Insights panel, matching what was there before.
- [ ] Creating a new session, uploading a document, and asking a question all work identically to the pre-auth version, just now persisted and scoped to the logged-in user.
- [ ] Two separate test accounts cannot see each other's sessions/documents/messages — including when directly querying the API with a valid token for a different session ID (not just "hidden in the UI").
- [ ] Logging out and back in restores the same session list and history.
- [ ] All existing pages (landing, product, pricing, about) and the existing visual design are unchanged, and remain viewable by a logged-out visitor without any redirect.
- [ ] A logged-out user hitting `/workspace` directly (or clicking "Launch Workspace") is redirected to `/login`, and after logging in/signing up lands directly in the workspace, not back on the landing page.
- [ ] The nav bar shows "Log in" when logged out, and an account menu / "Launch Workspace" when logged in.
- [ ] The RAG pipeline (retrieval, generation, citations) behaves identically to before this phase — no regressions.

## Explicitly out of scope for this phase

Anything listed under "Explicit non-goals" above. If it seems tempting to add while in the code, don't — flag it as a suggestion for the next phase instead.
