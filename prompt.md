# DocuMind — Production-Ready Bug Fixes & Workspace UI Redesign

This is a combined, single-source spec. It contains two independently testable tracks:

- **PART A — Functional Bug Fixes** (upload/polling loop, multi-file-type answering, Excel ingestion error and backend process crash, session delete failure, weak RAG grounding, full multi-format robustness)
- **PART B — Workspace UI Redesign** (structural/layout only — theme, colors, typography, icons must NOT change; must match the attached `Updated-UI.png` reference image, present in the project's working directory, exactly in structure)

Implement Part A and Part B as separate, independently testable changes. Do not mix concerns: bug fixes must not alter visual design, and the UI redesign must not alter backend/API behavior beyond what's needed to support the new layout. This repo was just `git reset --hard` to the latest clean commit — treat this as the authoritative spec for rebuilding both tracks correctly and completely, production-ready, no half-measures.

---

## PART A — FUNCTIONAL BUG FIXES

### A1. Upload gets stuck in an infinite processing loop / "Unable to poll document status"

**Observed behavior:** After uploading a document, the first attempt fails silently, a retry appears to succeed, but the pipeline status (Upload → Extraction → Embedding → Analysis → Ready) never resolves. The UI shows a persistent error: `Unable to poll document status`. Meanwhile Session Insights (executive summary) and Top Keywords still populate — meaning ingestion partially succeeds even though the frontend believes it failed.

**Required fixes:**

1. **Fix the root upload failure first.** Instrument the initial upload request (`POST /documents/upload` or equivalent) with server-side logging of status code, payload size, and content-type. Reproduce the "fails first, succeeds second" pattern and identify whether this is a race condition (e.g., workspace/session not yet created server-side when the file lands), a cold-start timing issue, or a duplicate-request issue from the frontend firing twice (check for double `onDrop`/double submit handlers, especially under React StrictMode or fast re-renders).
2. **Fix the status polling endpoint** (`GET /documents/workspace/{workspaceId}` or the specific document status endpoint):
   - Confirm the endpoint returns `200` with a well-formed JSON body in all normal states (`pending`, `processing`, `completed`, `failed`) — never an unhandled `500`.
   - Add a distinct terminal `failed` status with an `error` field, so the frontend can stop polling and show a real error instead of looping forever.
   - Add a max-retry / backoff ceiling on the frontend poller (e.g., stop after N attempts or T seconds, then surface a clear "Processing is taking longer than expected — retry?" state instead of an infinite loop).
3. **Make the poller resilient to transient failures.** A single failed poll (network blip, 502, etc.) should not immediately show "Unable to poll document status" to the user — retry with exponential backoff (e.g., 3 retries) before surfacing an error state.
4. **Reconcile the mismatch** between "processing appears stuck/failed" and "insights/keywords already generated." This strongly suggests the ingestion pipeline finishes but never writes/broadcasts the final `completed`/`ready` status. Audit the pipeline's last stage (Analysis → Ready) to confirm it always updates the document's status record, even if downstream insight-generation is what actually completes first. Status transitions and insight generation should not be able to diverge.
5. Add a document-level `status: failed` UI state (not just an infinite spinner) with a manual "Retry processing" action.

### A2. No response / wrong response when multiple documents of different types are attached, especially images

**Observed behavior:** When a session includes multiple attachments of different types (PDF, DOCX, XLSX, PPTX, PNG), asking a question that references a specific file (e.g., "agile.png, use this and give me a summary for this image specifically") returns: _"No relevant text available… no relevant information could be found for 'agile.png'… a summary of the image is not possible."_ Image-type documents are never actually being analyzed.

**Required fixes:**

1. **Confirm image ingestion path exists at all.** Text-based formats (PDF/DOCX/XLSX/PPTX) appear to go through a text-extraction → chunk → embed pipeline. Images likely have no equivalent path. Add one:
   - On upload, if the file is an image (PNG/JPG/etc.), run it through a vision-capable step: either (a) a captioning/description model call, or (b) direct multimodal model calls at query time using the stored image, or (c) OCR when the image contains text/diagrams.
   - Store the resulting description/OCR text as the image's "content" so it can be embedded and retrieved like any other document chunk, AND retain a reference to the raw image so a multimodal model can be called directly on it when the user asks about that specific file.
2. **Fix per-file targeting.** When a user names a specific file in their query (e.g., "agile.png"), the retrieval layer must first check for an explicit filename match in the session's document list before falling back to semantic search. Currently the filename mention is not being resolved to the actual stored document at all — the system searches semantically and finds nothing, rather than looking up the file by name.
3. **Fix multi-type context assembly.** When a session has mixed file types, the RAG context builder must merge chunks from all types (extracted text, table data from spreadsheets, slide text from presentations, and image descriptions/OCR) into a single ranked context, not just query the text-document index. Verify the retriever isn't silently filtering out non-text-indexed documents.
4. **PPTX support:** add a dedicated extraction path for `.pptx` — slide text, speaker notes, and embedded images (routed through the same image pipeline as A2.1) — so slide decks are first-class citizens alongside PDF/DOCX/XLSX/images, not an afterthought.
5. Add explicit test cases: (a) query mentioning an image filename directly, (b) query with no filename that should still consider an image if relevant, (c) session with PDF + XLSX + PPTX + PNG all present, asking a question that requires combining information from at least three of them.

### A3. Excel files fail to upload — `Internal Server Error`

**Confirmed reproduction (latest test pass):** PDF, DOCX, image (PNG), and PPTX uploads now all work correctly — each was uploaded one at a time and a follow-up question was asked and answered correctly after each. The failure is isolated specifically to XLSX: uploading an Excel file as the 5th document (after PDF/DOCX/image/PPTX are already present and processed in the session) throws the error below and the document never uploads. This confirms the bug is specific to the XLSX ingestion path (or its interaction with an existing multi-document workspace state), not a general upload regression — fix must be verified with an XLSX upload happening _after_ other formats already exist in the session, not just in isolation.

**Observed console error:**

```
Error: Internal Server Error
Source: src\app\workspace\[workspaceId]\page.tsx (205:33) @ eval
203 |       try {
204 |         const response = await fetch(`${API_BASE}/documents/workspace/${workspaceId}`);
205 |         if (!response.ok) throw new Error(await response.text());
206 |         const docs: DocumentStatus[] = await response.json();
207 |         setDocuments(docs);
```

**Additional evidence (latest test pass):** the dev server logs show repeated `Failed to proxy ... [Error: socket hang up] { code: 'ECONNRESET' }` on `/api/v1/documents/upload`, `/api/v1/workspaces/{id}/sessions`, and `/api/v1/documents/workspace/{id}` immediately around the failed XLSX upload — this is stronger than a normal 4xx/5xx response; a "socket hang up" means the backend process itself is dying or the connection is being dropped mid-request, not cleanly returning an error. This strongly suggests the XLSX parsing failure is an **unhandled exception that crashes or restarts the backend worker/process**, which then briefly takes down _all_ endpoints (sessions, uploads, document listing) until it recovers — not just the one upload request. The fix must address this at the process level, not just wrap the one endpoint.

**Required fixes:**

1. This is a **frontend surfacing a backend 500**, not a frontend bug. The fetch to `/documents/workspace/{workspaceId}` is failing server-side after an XLSX upload. Reproduce with the exact failing file and get the real backend stack trace/logs (the frontend only shows the generic response text).
2. **Process-level resilience (priority):** identify why the backend process/worker is crashing or hanging up the socket during XLSX ingestion rather than returning a clean error response. Ensure the ingestion pipeline runs the actual file-parsing step in a way that a thrown exception is caught at the request-handler level (or in an isolated worker/task) and converted into a proper HTTP error response — it must never be able to crash or restart the whole backend process, which is what's currently taking down unrelated endpoints (sessions, document listing) for other requests in flight at the same time.
3. Likely causes to check on the backend document parser:
   - The Excel parser (e.g., `openpyxl`/`pandas`/`xlsx`-parsing lib) throwing on a specific sheet structure (merged cells, multiple sheets, empty sheets, formulas vs. values, `.xls` vs `.xlsx`).
   - The parser choking on `0 pages` metadata (per the screenshot, the XLSX shows "0 pages" and status "pending" — indicating the page/sheet count logic doesn't handle spreadsheets and may be throwing when it tries to compute a page count).
   - An unhandled exception in the ingestion worker that then poisons the workspace's document-list query itself (i.e., one bad document's failed processing is breaking the endpoint that lists _all_ documents for the workspace, rather than just that one document showing an error state).
4. **Isolate failure blast radius:** one document's ingestion failure must never break the `GET /documents/workspace/{workspaceId}` listing endpoint, the sessions endpoint, or the upload endpoint for the whole workspace — these must remain independently available even while one XLSX file is failing to parse. Wrap per-document status resolution in try/catch so a single malformed record returns `status: failed` for that document while the rest of the list still loads.
5. Add server-side validation + a clear 4xx (not 500, and never a dropped connection) with a human-readable message when a file genuinely can't be parsed (e.g., corrupt/password-protected spreadsheet), so the frontend can show "This file couldn't be processed" instead of a generic Internal Server Error.
6. On the frontend, wrap the `fetch(...)` in `page.tsx` with proper error typing so a backend 500 renders a friendly inline error/toast instead of an unhandled thrown error breaking the page.
7. Verify the fix under the same conditions it was observed: XLSX uploaded after other formats already exist in the session, with the dev server logs watched for any `socket hang up` / `ECONNRESET` — none should occur; a failed parse must produce a clean JSON error response, not a dropped connection.

### A4. Answers are sometimes not well-grounded in document context

**Observed behavior:** Responses are occasionally generic, not clearly tied to the uploaded content, or don't sufficiently answer the question.

**Required fixes:**

1. Once A2 is fixed (all file types properly chunked/embedded), re-evaluate whether this issue persists — a large share of "ungrounded answers" is likely just A2's missing image/spreadsheet/slide retrieval producing empty context.
2. Log the actual retrieved context chunks per query (dev/debug mode only) to verify retrieval quality — check chunk size, overlap, and top-k value; overly small top-k or poor chunking (e.g., splitting mid-table for spreadsheets, mid-slide for decks) will produce weak grounding even when retrieval technically "works."
3. Ensure the system prompt instructs the model to explicitly say when the retrieved context doesn't contain the answer, rather than guessing — but only after confirming retrieval itself is actually returning relevant chunks (per A2/A3 fixes).

### A5. General multi-format robustness (production bar)

- The ingestion pipeline must treat PDF, DOCX, XLSX, PPTX, and common image formats (PNG/JPG) as equally first-class inputs — no format should be "supported in name only."
- A session with any combination of these formats attached simultaneously must answer questions that require combining information across formats (e.g., a number from a spreadsheet plus a claim from a PDF plus a diagram from an image) in a single coherent response.
- Every ingestion failure, for any format, must degrade gracefully to a per-document `failed` status with a human-readable reason — never a workspace-wide crash or an unhandled exception bubbling to the frontend.

### A6. Deleting a session fails — `{"detail":"Session not found"}`

**Observed behavior:** Attempting to delete an existing session (one that has messages, attached documents, and generated insights already in it) fails with a 404-style error `{"detail":"Session not found"}`, thrown from the `DELETE /workspaces/{workspaceId}/sessions/{sessionId}` call in `page.tsx`. The session, its chats, its attached documents, and its insights all remain — nothing gets cleaned up, and the user has no way to manage or remove old sessions at all right now.

**Required fixes:**

1. **Reproduce and fix the backend lookup itself.** A `Session not found` on a session that visibly exists and is currently loaded in the UI means the backend's session lookup (by `sessionId`, scoped to `workspaceId`) is failing even though the row/record exists — check for: a mismatched ID type (string vs. UUID vs. int) between what the frontend sends and what's stored, a query that filters on the wrong workspace scope, or a session that was created client-side / in a different store than the one the delete endpoint reads from (e.g., created against an in-memory or default `demo` workspace that doesn't match what's queried on delete).
2. **Verify session creation and deletion use the same source of truth.** If sessions are partially managed client-side (e.g., optimistic local state) and partially server-side, ensure a session created through the UI is fully persisted server-side with a stable, correct ID before it's rendered as deletable — the delete call must be able to find any session that create/rename/list can already see.
3. **Full delete semantics:** deleting a session must cascade-delete (or clearly soft-delete) everything scoped to it — its messages/chat history, its document associations, and its generated insights (executive summary, top keywords) — so nothing orphaned remains queryable or visible after deletion.
4. **Error handling:** if a delete is attempted on a session that genuinely no longer exists (e.g., already deleted in another tab), return a clear 404 the frontend can handle gracefully (remove it from local state, show a toast) rather than a raw thrown error breaking the page.
5. On the frontend, after a successful delete, remove the session from the sidebar list immediately and, if it was the active session, switch to another existing session (or a fresh empty state if none remain) without requiring a manual page reload.
6. This must be verified end-to-end: create a session, upload documents to it, chat in it, generate insights, then delete it — confirm the delete succeeds and everything tied to that session is gone from the UI and backend on next load.

### B0. Scope discipline (read this first)

This is a **structural/layout refactor only**, scoped strictly to the **workspace/conversation route** (e.g., `src/app/workspace/[workspaceId]/page.tsx` and its child components).

**Do not change:** colors, purple accent system, glow/blur effects, typography/fonts, border-radius, icon set, button visual styles, card styling, or the animated background video. Every visual token currently in use must be reused as-is — this task changes _where_ things sit, not _how_ they look.

**Do change:** page structure, container width/height, column layout, sticky/scroll behavior, and component placement, so the workspace matches the attached reference design (`Updated-UI.png`) exactly — a three-column layout modeled on ChatGPT / Claude / Gemini.

**Remove entirely:** the standalone "Workspace Document Library" panel/section on the right side of the current build. Document management moves fully into the left sidebar. Do not keep a second, separate document list anywhere else.

### B0a. Homepage background video — autoplay fix (fix this first, before any workspace layout work)

**Observed behavior:** On a first-ever load of the homepage (fresh page load, e.g., first visit or hard navigation), the animated background video does not start playing. Reloading the page, or opening it a second time, causes the video to start playing correctly. So the video asset, element, and styling are all correct — it is purely a first-load autoplay/initialization issue.

**Required fixes:**

1. Identify why the `<video>` element's playback doesn't begin on the very first mount. Common causes to check: the `autoPlay` attribute alone isn't reliable across browsers, especially if `muted` isn't also set (browsers block autoplay-with-sound but allow autoplay-when-muted) — confirm the video element has `muted`, `autoPlay`, and `playsInline` all set together.
2. Check whether the video's `src` is being set/swapped after mount (e.g., via a `useEffect` that runs after initial render, or a dynamic import/lazy-load) — if so, call `.play()` programmatically once the source is ready and attached, rather than relying solely on the `autoPlay` attribute, since attribute-driven autoplay can silently fail to trigger if the source arrives late.
3. Check for a hydration timing issue (SSR/CSR mismatch) — if the video element is server-rendered without a ready source and only gets its real source client-side, the browser may miss the autoplay window on first paint. Ensure the video is mounted with its final `src` already attached on first client render, or explicitly call `.play()` in a `useEffect` after mount and handle the returned promise (catch and retry-on-interaction if the browser rejects it).
4. Do not change the video asset, its visual styling, size, position, or opacity — this is purely a playback-trigger timing fix, not a visual change.
5. Verify the fix by testing a true first load (clear cache / incognito / hard reload) — the video must be playing before or immediately as the page becomes visible, with no visible delay or blank/frozen frame, and this must hold consistently across repeated fresh loads, not just intermittently.

### B1. Reference layout (use `Updated-UI.png` as the literal target)

The reference image shows the target structure exactly — build to match it:

- **Left column (~260–300px):** header "Workspace" with sparkle icon → `SESSIONS` block → `DOCUMENTS` block.
- **Center column (flexible, largest width):** header "AI ASSISTANT / Conversation" (left) + "Active session: {name}" (right) → scrollable message thread with user/AI bubbles → compact horizontal `Processing Status` timeline → chat input positioned directly below the timeline, close to the conversation — **not** stranded far down the page.
- **Right column (~300–340px):** header "Session Insights" with chart icon → `EXECUTIVE SUMMARY` card → `TOP KEYWORDS` pill cluster.
- The animated purple/blue background video remains visible in the page's outer margins/gutters — the three-column workspace container should sit as a bounded, wide panel with visible background around/behind it, not a layout that fills 100% of the viewport edge-to-edge and hides the video.

### B2. Page-level layout structure

Replace the current vertically-stacked/overflow-prone structure with a fixed-viewport, three-pane CSS grid (or flex) layout so the page itself never scrolls — only the panes inside it do.

```
[ Workspace Grid — flex: 1, min-height: 0, overflow: hidden ]
   ├── Left Sidebar   (fixed width ~280px, own overflow-y: auto)
   ├── Center Column   (flex: 1, min-width: 0, display: flex, flex-direction: column)
   │      ├── Conversation Header (fixed height)
   │      ├── Messages Scroll Area (flex: 1, overflow-y: auto, min-height: 0)
   │      ├── Processing Status timeline (fixed height, compact, horizontal)
   │      └── Chat Input (fixed height, non-shrinking, sits immediately below the timeline)
   └── Right Sidebar  (fixed width ~320px, own overflow-y: auto)
```

Key implementation notes:

- Use `height: 100vh` (or `100dvh` for mobile browser chrome correctness) on the outer app shell, with `overflow: hidden` at that level, so nothing outside the three panes can push the page taller than the viewport.
- Each of the three columns manages its **own** vertical scroll (`overflow-y: auto; min-height: 0;`) — this is what prevents "excessive scrolling" and keeps the chat input from drifting below the fold regardless of how many sessions, documents, or messages exist.
- **Critical fix from current build:** the chat input currently sits far too low on the page and users have to scroll or hunt for it. Fix this by making the center column a flex container where the message area is `flex: 1; overflow-y: auto;` and the timeline + input are non-shrinking (`flex-shrink: 0`) elements pinned directly beneath it — the input must be immediately visible and close to the conversation at all times, exactly as shown in the reference image, never requiring the page to scroll to reach it.
- The center column's chat input is **not** `position: fixed` to the browser window (that breaks at different zoom levels/screen sizes) — the flex approach above keeps it "sticky" relative to its own column at any zoom level, including 80–90%.
- Verify at 80%, 90%, and 100% browser zoom that all three columns remain visible without horizontal scrolling and the chat input never requires scrolling the whole page to reach.

### B3. Left Sidebar — Sessions + Documents

**Sessions block**

- Header row: `SESSIONS` label (small caps, muted) + `+ New Session` button (existing button styling), right-aligned. Clicking creates a new session and makes it active.
- Session list: each row shows session name, with the **active session visually highlighted** (existing active/selected state styling — background tint + accent border/text, matching current purple accent usage). Clicking a row switches the active session.
- Each session row has a kebab/three-dot menu (as in the reference image) triggering **`Rename`** (inline edit or modal — updates the session name in place) and **`Delete`** (removes that specific session) actions, using the existing dropdown/menu component styling.
- Below the list: a `Delete Session` button styled with the existing destructive/red treatment, acting on the currently active session — matches the reference image exactly.
- List scrolls independently once it exceeds available vertical space; sidebar itself does not grow the page.

**Documents block**

- Header: `DOCUMENTS` label.
- Compact drag-and-drop upload zone (reuse the existing upload component's visuals, just resize/reposition to fit the narrower sidebar):
  - Upload/cloud icon
  - "Drag & drop files here"
  - "or click to browse" (as a clickable sub-action, existing link/accent color)
  - "Supported formats: PDF, DOCX, XLSX, PPTX, PNG/JPG, TXT, MD" — keep this label accurate to what A2/A5 actually support once shipped.
- Document list below the upload zone: each item shows a **file-type icon/logo matching its format** (PDF, DOCX, XLSX, PPTX, image), filename (truncate with ellipsis + tooltip/title attr for full name), type + size on a secondary line, and a kebab menu with `Rename` / `Delete`.
- **Fix inline status badge overflow:** while a document is uploading/processing, the small inline status text (e.g., "Uploading...") currently overflows outside its badge/pill container instead of staying contained within it. The badge must have a fixed max-width relative to the row, truncate or wrap its text correctly, and never spill outside its own boundary or push/overlap adjacent text (filename, type/size line, kebab menu) regardless of status label length (`Uploading`, `Processing`, `Completed`, `Failed`).
- **Do not** show a separate progress/pipeline block per individual document in this list — per-document status can be a small inline badge (e.g., "completed", "processing", "failed") next to the filename, not a full 4-stage pipeline (that lives once, centrally, above the chat input — see B5).
- `View all documents →` link at the bottom **only if** the list is long enough to need pagination/expansion within the same sidebar (opens the list to show all vs. a capped preview) — this must not navigate to a separate "Document Library" page/route, since that concept is being removed.
- Entire Documents block scrolls independently within the left sidebar if sessions + documents together exceed the sidebar's height; give Sessions a max-height with its own scroll and Documents its own scroll beneath it, so a long session list doesn't push documents fully out of view.

### B4. Center Column — Conversation

**Header (compact, fixed height, does not scroll):**

- Left: small "AI ASSISTANT" eyebrow label + existing AI/sparkle icon + "Conversation" title (existing heading typography).
- Right: "Active session: {session name}" in the existing accent color.

**Message thread (scrolls independently, flex: 1):**

- AI messages: left-aligned, existing AI avatar/icon, existing dark bubble/card styling, support markdown rendering (paragraphs, bullet/numbered lists, bold, links). If markdown rendering isn't already implemented for AI responses, add it (e.g., `react-markdown` or existing equivalent) — the reference image's AI messages show structured bullet content, so this must render as real formatted lists, not plain-text bullets.
- User messages: right-aligned, existing user/profile icon, existing rounded bubble styling, visually distinct from AI bubbles (already differentiated by alignment + icon — keep as-is).
- Auto-scroll to latest message on new message arrival, but preserve manual scroll position if the user has scrolled up to read history (don't yank them back down mid-read).
- Long AI responses use the "See details ↓" expandable pattern shown in the reference image — collapsed-by-default long answers with an expand toggle.

### B5. Processing Status — a real animated timeline, above the input

This must feel like a genuine, polished timeline experience, not a static row of icons — reuse existing visual tokens only, but bring the interaction to life:

- One workspace-level horizontal status bar (not per-document), positioned directly above the chat input, below the message thread.
- Left label: small "Processing Status" text + existing status/wave icon.
- Stages rendered as a horizontal row of icon nodes connected by a connecting line, matching the reference image exactly: `Upload Complete → Extraction → Embedding → Analysis → Ready`.
- Visual states (reuse existing purple accent tokens — no new colors):
  - **Completed stage:** filled purple circle with checkmark/existing "done" icon; the connecting line leading into it fills solid in accent color.
  - **Current/active stage:** purple circle with the existing sparkle/spinner icon, animated/glowing (reuse existing glow/pulse CSS already defined elsewhere in the app; do not invent a new animation style).
  - **Future/pending stage:** grey/muted circle, muted label, dashed/light connecting line.
- As a document actually advances through the pipeline (driven by the same status source fixed in A1), the timeline should visibly progress in real time — the connecting line fills in and the active node's glow moves forward stage by stage, so the user perceives real progress rather than a flat status label.
- When nothing is actively processing, collapse to a slim "All documents ready" summary line, or show the last-completed state — pick whichever best matches the compact, non-intrusive feel in the reference image.
- Must remain a single fixed-height row — never expand into a tall block, and never duplicate per uploaded document.

### B6. Chat Input — brought up, sticky, single attachment control

- **This is a priority fix:** in the current build the input sits too far down the page. It must sit immediately below the Processing Status timeline, always visible without any scrolling, exactly as positioned in the reference image.
- Large rounded input (reuse existing input styling), placeholder "Type your message...".
- Exactly one attachment/paperclip icon inside the input, **on the left side** — this is a convenience shortcut only; it routes uploaded files through the same upload pipeline as the sidebar's Documents uploader, tagged to the active session. Do not add a second/duplicate upload widget in the center column.
- Send icon **on the right side** of the input (existing icon + accent color) — sends the query.
- Input is the fixed-height, non-shrinking last element of the center column's flex layout (see B2) — always visible without scrolling the page, regardless of message count, document count, or session count.

### B7. Right Sidebar — Session Insights

- Header: chart/insights icon + "Session Insights" title.
- **Executive Summary card:** existing dark card styling, supports multiple bullet points and can scroll internally if content is long (`max-height` + `overflow-y: auto` on the card itself, not the whole sidebar) so one very long summary doesn't push Top Keywords off-screen.
- **Top Keywords section:** header "TOP KEYWORDS" + existing rounded pill/tag styling, wrapped in a flex-wrap row, auto-generated from session/document/conversation content.
- Sidebar scrolls independently if both cards together exceed available height.
- Remove the current "Workspace Document Library" block from this sidebar entirely (per B0) — replace that vertical space with the Top Keywords section per the reference layout.

### B8. Responsive behavior

- **Large desktop (primary target, ~1280px+):** full three-column layout as described, center column gets the remaining width after both sidebars' fixed widths are subtracted.
- **Medium screens (~960–1280px):** reduce sidebar widths proportionally (e.g., left ~240px, right ~280px) before considering collapse; keep all three columns visible as long as reasonably possible.
- **Small/narrow screens (<960px):** collapse left and right sidebars into slide-over drawers, triggered by two icon buttons in the center header (a "sessions/documents" icon on the left of the header, an "insights" icon on the right) — center conversation remains the only always-visible column. Drawers overlay on top of the center column (existing dark/glass panel styling) rather than squeezing it unusably narrow.
- Explicitly verify no layout breakage at 80% and 90% zoom on a standard 1440px and 1920px display.

### B9. Non-negotiable acceptance criteria

- [ ] Homepage background video plays automatically on a genuine first load (cache cleared / incognito) — not only on reload or second visit.
- [ ] No page-level vertical scrollbar appears in the workspace route at any zoom level tested — only the three internal panes scroll.
- [ ] Chat input is visible without scrolling immediately on workspace load, positioned directly beneath the Processing Status timeline (not far down the page), and remains visible after adding many sessions, many documents, and a long conversation.
- [ ] Processing Status renders as a genuine progressing timeline (filling connector lines, glowing active node) driven by real backend status — not a static row.
- [ ] Only one processing-status component exists per workspace (not one per document).
- [ ] Only one attachment control exists in the center column (the input's paperclip, left side); primary upload UX lives in the left sidebar. Send control is on the right side of the input.
- [ ] Sessions support full create / rename (via kebab menu) / delete (via kebab menu, and via the dedicated `Delete Session` button for the active session) lifecycle — deleting a session succeeds without a "Session not found" error, and its messages, documents, and insights are fully gone on next load.
- [ ] Excel (XLSX) uploads succeed reliably, including as the 5th+ document in a session that already has PDF/DOCX/PPTX/image documents attached, with no backend process crash and no `socket hang up`/`ECONNRESET` errors on any endpoint during the upload.
- [ ] Inline document status badges ("Uploading", "Processing", "Completed", "Failed") stay contained within their pill/badge boundary and never overflow into adjacent text.
- [ ] The standalone "Workspace Document Library" panel/route is fully removed; all document actions (upload, rename, delete, view all) are reachable from the left sidebar only.
- [ ] Zero changes to color values, fonts, icon set, border-radius, or the background video — a visual diff against the current build should show only positional/sizing changes, not restyled components.
- [ ] Background video remains visible in the margins around the three-column workspace container on large screens.
- [ ] Session management (create/switch/rename/delete, active-session highlight) and document management (upload/drag-drop/rename/delete/status) both remain fully functional after the layout change.
- [ ] Any combination of PDF, DOCX, XLSX, PPTX, and image documents attached to one session can be queried together, individually by filename, or in combination, with grounded answers.

