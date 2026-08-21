# DocuMind — Production Readiness Pass: Global UI Regressions, Workspace UX Bugs & Per-Format Answer Quality

This is the current, authoritative, single-source spec. Earlier rounds (initial bug fixes + three-column workspace redesign) have been implemented and partially verified — this round fixes **regressions introduced by that work** plus a set of **newly discovered bugs**, and closes out the remaining **per-file-type answer-quality gaps**. Treat this document as complete and self-contained; do not assume anything not stated here is already correct.

There are three tracks. Implement and test them as separable concerns, but all three must be true simultaneously in the final build:

- **PART A — Global Frontend Regressions** (background animation broken on every page, page scroll locked on every page)
- **PART B — Workspace Area UX Bugs** (missing header, session kebab menu behavior, processing timeline animation bugs, stale session insights on new session)
- **PART C — Per-Format Answer Quality** (Excel returns raw data instead of an answer; images give poor answers and broken insights; PDF/DOCX/PPTX already work correctly and must not regress)

**Non-negotiable constraint across all tracks:** do not change colors, typography, icon set, border-radius, component visual styling, or the overall theme. This is a correctness and stability pass, not a redesign — every fix here should make existing intended behavior actually work, not introduce new visual design.

---

## PART A — GLOBAL FRONTEND REGRESSIONS (affects Home, Product, Pricing, About, and Workspace)

These are regressions relative to the previous round — the earlier fix only addressed the video not autoplaying on first load; it has now regressed further: the video does not load/play at all, and page scrolling is now completely locked. Fix both properly, on **every** route, not just the homepage.

### A1. Background animation does not load on any page

**Observed behavior:** On Home, Product, Pricing, About, and inside the Workspace area, the animated background is not loading or playing at all (previously it merely failed to autoplay on first load and would work after a reload — now it does not work at all, on any load).

**Required fixes:**

1. Treat this as a full regression from the previous fix attempt — re-check whatever change was made for the first-load autoplay issue; it likely broke the video element's mount, source, or a shared layout/provider that all routes depend on.
2. Confirm the video asset itself is being requested successfully (check the network tab for a 200 on the video source on every route) — rule out a broken path, a route-specific asset reference, or an accidentally-removed shared background component.
3. Confirm the background component is actually present in the DOM on **every** route (Home, Product, Pricing, About, Workspace) — if it lives in a shared layout, verify that layout wraps all of these routes correctly; if each page mounts its own instance, verify none of them were dropped or broken during the workspace layout refactor.
4. Re-apply the autoplay requirements correctly this time: `muted`, `autoPlay`, and `playsInline` all set together on the `<video>` element, with `.play()` called explicitly in a post-mount effect (handling the returned promise) as a fallback in case the attribute-driven autoplay doesn't trigger.
5. Do not change the video's visual styling, size, position, opacity, or the asset itself — this is purely a "does it load and play, on every route" fix.
6. Verify on a genuine first load (cache cleared / incognito) on all five routes individually: Home, Product, Pricing, About, Workspace.

### A2. Page cannot be scrolled to the bottom — on every page, including Workspace

**Observed behavior:** On every route (Home, Product, Pricing, About, and the Workspace area), the page scroll is locked/stuck partway down — the user cannot scroll to the end of the page content. This affects marketing pages (which should scroll normally, full page) as well as the Workspace route (which should have the fixed-viewport, internally-scrolling three-pane behavior specified separately in Part B/B-legacy layout work).

**Required fixes:**

1. This is very likely a global CSS regression — check the root/shared layout (e.g., a top-level `<html>`, `<body>`, or app-shell wrapper) for an `overflow: hidden` or a fixed `height: 100vh` rule that was intended **only** for the Workspace route's fixed-viewport layout but leaked into the global layout and is now clipping/locking scroll on the marketing pages too.
2. **Home / Product / Pricing / About must scroll normally as full pages** — no height lock, no `overflow: hidden` at the document/body level, content must be reachable all the way to the footer on every one of these routes.
3. **Workspace route** should keep its intended fixed-viewport behavior (outer shell fixed height, only the three internal panes scroll) — but verify this scoped `overflow: hidden` is applied **only** to the workspace route's own container, not to a shared ancestor (`body`, root layout, global CSS) that other routes also inherit from.
4. After the fix, explicitly verify: marketing pages scroll fully to their footer with no dead zone, and the Workspace route has zero page-level scroll but all three internal panes (sidebar, conversation, sidebar) scroll independently and correctly.

---

## PART B — WORKSPACE AREA UX BUGS

### B1. DocuMind header is missing inside the Workspace route

**Observed behavior:** When navigating into the Workspace area, the top-level `DocuMind` header/nav bar (wordmark, nav links, Launch button — as present on Home/Product/Pricing/About) is gone entirely.

**Required fixes:**

1. Restore the shared top header on the Workspace route. If the three-column workspace layout was built as a route that opts out of the shared app layout/header (a common cause when a route defines its own full-height shell), reintroduce the header as a slim fixed-height bar above the three-pane workspace grid, consistent with how it was already scoped in the original layout spec (top bar sits above the three columns, workspace grid takes the remaining height).
2. Do not let the header's presence break the workspace's fixed-viewport behavior — the header is a fixed-height element at the top of the shell; the workspace grid below it still takes `flex: 1; min-height: 0; overflow: hidden;` with only its three internal panes scrolling.
3. Verify the header is visually and functionally identical to the one on Home/Product/Pricing/About (same nav links, same styling) — no visual changes, just restoring its presence.

### B2. Session rename via kebab menu shows a scrollable list instead of a direct action menu

**Observed behavior:** Clicking the three-dot (kebab) menu next to a session currently opens something that requires scrolling before the `Rename` option becomes reachable/usable, rather than immediately showing a small dropdown with `Rename` and `Delete` as direct, immediately-clickable options.

**Required fixes:**

1. The kebab menu must open a small, standard dropdown/popover anchored to the three-dot button, containing exactly two direct actions — `Rename` and `Delete` — both immediately visible and clickable with no internal scrolling required.
2. Remove whatever caused a scrollable container to appear here (likely an oversized menu component, a list-style component reused incorrectly for a 2-item menu, or a popover with an incorrect max-height/overflow rule).
3. `Rename` should trigger inline editing of the session name (or a minimal modal — whichever the existing design system already uses elsewhere for renaming) directly, in one click, not after scrolling through an intermediate list.
4. `Delete` should behave as already specified: removes that specific session (and, per the earlier fix, its messages/documents/insights) — confirm this still works correctly after the menu fix.
5. Verify the dropdown closes on outside click / selecting an action / pressing Escape, consistent with standard menu behavior elsewhere in the app.

### B3. Processing Status timeline animation bugs

**Observed behavior:**

- The second stage, **Extraction**, blinks continuously/constantly regardless of actual processing state — it does not reflect real progress, it just blinks on its own.
- The other stages do not animate or progress in sequence as a document actually moves through the pipeline.
- The final stage, **Ready**, does not turn purple (the "completed" accent color) even once processing is genuinely finished — it stays in its non-completed state.

**Required fixes:**

1. **Remove any hardcoded/looping animation** on the Extraction node specifically — its visual state (pending / active-glowing / completed) must be driven entirely by the real backend processing status for the current document(s), the same status source fixed in the earlier polling work, not by a CSS animation that loops independently of actual state.
2. **Correct stage-to-status mapping:** each of the five stages (`Upload Complete → Extraction → Embedding → Analysis → Ready`) must map to a real, distinct backend processing state. As a document moves through the real pipeline, the frontend timeline must update stage-by-stage in the correct order — each prior stage shown as completed (filled purple, checkmark) and only the current stage shown as active/glowing, with all future stages shown as pending/muted — exactly once per real state transition, not simultaneously, not out of order, and not via a fixed-duration animation that runs regardless of actual backend progress.
3. **Fix the Ready/completed end state:** once a document's backend status is genuinely `completed`/`ready`, the Ready node must render in the same filled-purple "completed" style as the other completed stages (with its checkmark/done icon) — confirm this final state isn't stuck in a different (e.g., default/grey) style due to a missing case in the stage-state mapping.
4. Re-verify the "genuine progressing timeline" behavior from the original spec: connecting lines fill in as each stage completes, only one node glows/animates at a time (the current stage), and the whole sequence reflects real backend state — not a static row, and not an uncoordinated animation.
5. Test with a full real upload end-to-end (not a mocked/instant state) to confirm the timeline visibly progresses stage by stage as the actual document is processed, and lands correctly on a purple "Ready" state at completion.

### B4. New session shows stale Session Insights from the previous session

**Observed behavior:** Creating a new session correctly produces an empty workspace and empty chat thread, but the right-hand **Session Insights** panel (Executive Summary bullets, Top Keywords) still shows the content generated for the _previous_ session instead of clearing to an empty/default state.

**Required fixes:**

1. Session Insights (Executive Summary + Top Keywords) must be scoped strictly to the currently active session's own documents and conversation — when switching to or creating a session with no documents/conversation yet, this panel must show an empty/placeholder state (e.g., "No insights yet — upload a document or start a conversation"), never carry over content from whichever session was previously active.
2. Check whether Session Insights state is being stored in a global/shared frontend store keyed incorrectly (e.g., not keyed by `sessionId`, or only refetched on document upload rather than on session switch) — fix so that switching the active session always triggers either a refetch scoped to the new session's ID or a clear-to-empty state if the new session has no generated insights yet.
3. Verify this is correct for all transitions: creating a brand-new session (should show empty), switching between two existing sessions that each already have their own insights (each must show only its own), and switching back and forth repeatedly (no stale bleed-through in either direction).

---

## PART C — PER-FORMAT ANSWER QUALITY

Current state across formats, confirmed by direct testing:

| Format       | Chat answers                                                 | Session Insights                                                |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------- |
| PDF          | Working correctly                                            | Working correctly                                               |
| Word (DOCX)  | Working correctly                                            | Working correctly                                               |
| PPTX         | Working correctly, includes slide references                 | Working correctly                                               |
| Images       | **Not working** — poor/incorrect answers                     | **Not working** — broken                                        |
| Excel (XLSX) | **Not working** — returns raw data dump instead of an answer | **Not working** — raw data dump instead of synthesized insights |

PDF, DOCX, and PPTX must not regress during this work — use their current correct behavior as the working reference for how retrieval + generation should behave once Excel and images are fixed.

### C1. Excel — answers are raw data dumps, not actual answers

**Observed behavior:** For any query about an uploaded Excel file, the chat response is just the raw underlying data (e.g., dumped rows/cells/values) rather than a synthesized natural-language answer to the actual question asked. The same problem occurs in Session Insights — the Executive Summary for a session containing an Excel file shows raw spreadsheet data instead of summarized bullet points.

**Required fixes:**

1. **Diagnose whether this is a retrieval-context or a prompting problem** (most likely both): confirm what's actually being passed to the model at query time for Excel-backed sessions — if the retrieved "chunks" for an XLSX file are just verbatim cell/row dumps with no structure or summarization, the model is being handed raw data and asked to answer with it directly, and may be echoing it back instead of reasoning over it.
2. **Fix Excel chunking/representation for retrieval:** structure spreadsheet content meaningfully before it's embedded — e.g., represent each sheet/table with column headers preserved and rows grouped in a way that keeps tabular relationships intelligible (not one giant flat blob of raw values), so retrieval returns coherent, boundedly-sized context rather than an entire raw table dump.
3. **Fix the generation prompt for spreadsheet-backed context:** ensure the system/task prompt explicitly instructs the model to interpret and answer from tabular data (e.g., compute, summarize, filter, or explain based on the rows/columns retrieved) rather than simply restating the raw values it was given. This must apply both to normal chat answers and to the Executive Summary / Top Keywords generation step for sessions containing Excel files.
4. **Executive Summary must synthesize, not dump:** for any session containing an Excel document, the Executive Summary generation call must explicitly produce a small number of natural-language bullet points describing what the data shows (trends, key figures, notable rows/categories) — never the literal cell contents themselves.
5. Add explicit test cases: (a) a factual lookup question against an Excel file ("what is X's value for Y") should return a direct, correctly-derived answer, not a table dump; (b) an aggregate/summary question ("summarize this spreadsheet" / "what are the key numbers here") should return synthesized prose or a short structured summary, not raw rows; (c) a session with an Excel file plus another format (PDF/DOCX) should be able to answer a question requiring both without either source degrading into a raw dump.

### C2. Images — answers and insights are not working correctly

**Observed behavior:** Questions about uploaded images produce answers that are not correct/useful, and Session Insights for sessions containing images are broken/not properly generated.

**Required fixes:**

1. **Verify the image ingestion path end-to-end** (this was the subject of an earlier fix — confirm it is actually functioning correctly now, not just partially): on upload, the image should go through a real vision-capable step (captioning/description and/or OCR as appropriate to the image content) and that description should be stored as retrievable content, while the raw image itself remains available for direct multimodal calls at query time.
2. **Check whether query-time answers are actually using the image** — for a query that references an image (by filename or contextually), confirm the multimodal model call is actually being made with the image attached/available, not just against a possibly-thin or incorrect stored description. If the stored description is too sparse (e.g., a one-line caption) to answer detailed questions, prefer calling the multimodal model directly on the raw image at query time for image-specific questions, using the stored description only for cross-document semantic retrieval matching.
3. **Fix image content in Session Insights generation:** the Executive Summary / Top Keywords generation step must correctly incorporate image content (via the same description/vision step) when a session contains images — verify this call is actually receiving image-derived content today; if it currently only receives text-format document content, that's why insights are broken for image-containing sessions.
4. **Fix retrieval/context assembly for images specifically** — confirm image-derived content is being merged into the same ranked context as text/spreadsheet/slide content (this was part of an earlier fix; verify it is holding correctly and wasn't broken by later changes) and that it isn't being silently dropped or deprioritized.
5. Add explicit test cases: (a) a direct question about a specific image by filename should produce an accurate, content-grounded answer; (b) a general session question that should incorporate an image among other documents should correctly draw on it; (c) Session Insights for a session containing only images, and for a session containing images plus other formats, should both generate correct, non-broken Executive Summary and Top Keywords output.

### C3. Regression guard for PDF, DOCX, PPTX

- These three formats are confirmed working correctly today for both chat answers and Session Insights (PPTX correctly includes slide references). Any change made for C1 (Excel) or C2 (Images) — particularly to shared retrieval/context-assembly or Session Insights generation code — must be re-verified against PDF, DOCX, and PPTX afterward to confirm no regression was introduced.
- Add/confirm a combined test: a single session with PDF + DOCX + PPTX + XLSX + image all attached, asked a question requiring information from at least three of them, must produce one coherent, correctly-grounded answer with no format degrading into a raw dump or a broken/empty response.

---

## FINAL ACCEPANCE CRITERIA (all must be true together)

- [ ] Background animation loads and plays correctly on a genuine first load, on every route: Home, Product, Pricing, About, and Workspace.
- [ ] Home, Product, Pricing, and About all scroll normally to their full page length with no scroll lock.
- [ ] The Workspace route has zero page-level scroll (fixed viewport) with only its three internal panes scrolling independently — this scoped behavior does not leak into any other route.
- [ ] The DocuMind header (wordmark, nav links, Launch button) is present and functional on the Workspace route, identical to its appearance on the marketing pages.
- [ ] Session kebab menu opens a small direct dropdown with `Rename` and `Delete`, no internal scrolling required to reach either option.
- [ ] Session create / rename / delete all work correctly, including full cleanup of messages/documents/insights on delete (per earlier fix — must still hold).
- [ ] Processing Status timeline: no stage animates independently of real backend state (no more constant blinking on Extraction); stages progress in correct order exactly in sync with real pipeline progress; the Ready stage renders in the completed purple state once processing genuinely finishes.
- [ ] Creating a new session shows an empty Session Insights panel (or an explicit empty state) — never the previous session's Executive Summary or Top Keywords. Switching between sessions always shows only that session's own insights.
- [ ] Excel (XLSX) queries return real synthesized answers, never a raw data dump; Excel-containing sessions produce a real synthesized Executive Summary, never raw cell/row content.
- [ ] Image queries return accurate, content-grounded answers; image-containing sessions produce correct, non-broken Session Insights.
- [ ] PDF, DOCX, and PPTX chat answers and Session Insights remain correct and unregressed (PPTX still includes slide references) after all Excel/image fixes.
- [ ] A single session with PDF + DOCX + PPTX + XLSX + image all attached can answer a question requiring information from at least three of them, correctly and coherently, in one response.
- [ ] No changes to color values, typography, icon set, border-radius, or the background video asset/styling anywhere in this pass — every fix here is a correctness/stability fix, not a visual change.


