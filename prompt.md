# DocuMind — Next Development Cycle: Video Playback, Chat Interface Cleanup & Scroll UX

This is the current, authoritative spec for this development cycle. The previous round's fixes are confirmed to have landed correctly for these items — **do not regress them**:

- Page scrolling now works correctly on all pages (Home, Product, Pricing, About, Workspace).
- The dedicated Processing Status timeline (the horizontal stage bar above the chat input) is working correctly — stages progress in sync with real backend status, animate correctly, and land on the completed "Ready" state.
- Session Insights (Executive Summary + Top Keywords) are populating correctly and are correctly scoped per session.

This cycle fixes the remaining issues below, confirmed by direct testing. Do not change colors, typography, icon set, border-radius, or overall theme/styling anywhere in this pass — every item here is a functional/UX correctness fix, not a visual redesign.

---

## 1. Background video animation still does not load/play on any page

**Observed behavior:** Despite the previous fix attempt, the animated background is still not loading or playing on any page — Home, Product, Pricing, About, and Workspace all still show no background animation. Page scroll is now fixed correctly, so the earlier `overflow: hidden` leak has been resolved, but the video itself remains non-functional everywhere.

**Required fixes:**

1. Treat the previous fix as unsuccessful and re-diagnose from scratch — do not assume the video element, autoplay attributes, or mount timing are correct just because they were addressed before.
2. First confirm the most basic thing: is the video asset actually being requested and returned successfully at all? Check the network tab / server logs on every route for the video's request — a 404, a broken path, a wrong `public/` asset location, or a build step not copying the asset over are all more likely than a subtle autoplay-timing bug if the video _never_ plays, on _every_ route, even after the previous fix.
3. Confirm the background video component itself is actually still present and mounted in the DOM on every route — inspect the live DOM on each of the five routes directly; if it is missing entirely (not just failing to play), the issue is that the component isn't being rendered at all, not a playback problem.
4. If the element is present and the asset loads but it still won't play: verify `muted`, `autoPlay`, and `playsInline` are all set together on the `<video>` tag, and add an explicit `.play()` call in a post-mount effect that handles (catches) the returned promise, retrying on the next user interaction if the browser rejects programmatic playback.
5. Check for a console error on every route (codec/format issue, CORS on the asset, a conflicting CSS rule like `display: none` or `visibility: hidden` applied to the video container by a more recent style change, or a z-index/stacking issue that hides it behind an opaque background even if it is technically playing).
6. Do not change the video's visual styling, size, position, opacity, or the asset itself.
7. Verify on a genuine first load (cache cleared / incognito) on all five routes individually, and report/confirm which of the above was the actual root cause so it doesn't recur in a future pass.

---

## 2. Chat interface shows the processing/status line multiple times when a PDF is uploaded

**Observed behavior:** When a PDF is uploaded, a "processing" line/message appears multiple times inside the chat message thread itself (not the dedicated Processing Status bar, which is confirmed working correctly). This should not be happening — the chat thread should only ever contain actual conversation messages (user questions and AI answers), never repeated system/status messages about document processing.

**Required fixes:**

1. Identify where this status message is being injected into the chat thread's message list/state — it is likely a status update handler (e.g., polling callback, websocket/event handler) that is incorrectly pushing a new chat message into the conversation on every status change or every poll tick, instead of only updating the dedicated Processing Status bar's state.
2. Remove document-processing status entirely from the chat message thread. All processing/pipeline status must live exclusively in the dedicated Processing Status bar (per the working timeline component) — the chat thread must never contain system-generated "processing" entries at all, not even a single one.
3. If a poller or event handler is firing repeatedly (e.g., once per poll interval) and each firing is appending a new message rather than updating one, fix the underlying cause: state updates from the polling/status source must update the Processing Status bar's own state in place, and must be completely decoupled from whatever appends to the chat message array.
4. Verify with a full real upload: uploading a PDF (and other formats) must never add any message to the chat thread — the chat thread should only ever grow when the user sends a message and when the AI responds to it.

---

## 3. Rename dropdown (session kebab menu) is positioned too far below the trigger

**Observed behavior:** Clicking the three-dot (kebab) menu next to a session opens the `Rename` / `Delete` dropdown, but the dropdown box appears noticeably below where the three-dot button actually is, rather than anchored directly to it.

**Required fixes:**

1. Fix the dropdown's positioning/anchoring so it opens immediately adjacent to the three-dot button that triggered it (directly below or beside it, per whatever the app's existing menu/popover component does elsewhere) — not offset further down the sidebar.
2. Check whether the dropdown is being positioned with a hardcoded/static offset, or whether it's anchored to the wrong reference element (e.g., the session row's top instead of the kebab button itself, or a stale/incorrectly-measured position from before the row's height was set).
3. If using a popover/portal-based menu, confirm it recalculates its position correctly relative to the actual trigger element's current on-screen position, including when the session list itself is scrolled.
4. Verify visually: the dropdown should appear snapped to the kebab button with no visible gap, for every session row in the list, including the first, a middle, and the last row.

---

## 4. Chat does not auto-scroll to the newest answer

**Observed behavior:** When a new query is submitted and the AI's answer comes back, the conversation view does not automatically scroll down to show it — the user has to manually scroll down to see the new answer.

**Required fixes:**

1. Implement auto-scroll-to-bottom behavior in the message thread: whenever a new message is appended (both the user's own sent message and the AI's response arriving), the thread must automatically scroll so the newest message is fully visible, without requiring any manual scrolling.
2. Preserve the previously-specified behavior of not yanking the user back down if they've deliberately scrolled up to read earlier history — auto-scroll should apply when the user is already at (or near) the bottom of the thread; if they've scrolled up to read older messages, a new message arriving should not forcibly snap them back down (a small "new message ↓" indicator/button to jump down is an acceptable pattern here if the app doesn't already have one, but is not required — the core requirement is: at-bottom by default, always auto-scroll to new content).
3. Verify with a full real conversation: sending several queries in a row, each answer must land fully visible without manual scrolling, for both short and long answers.

---

## 5. "See details" / expand-to-read-more is appearing on every answer, including short ones

**Observed behavior:** Every single AI answer is being collapsed behind a "See details ↓" / "see more" expand action, requiring an extra click to read the full response — even for answers that are not actually long. This should only happen for genuinely long responses, not as a default behavior on every answer.

**Required fixes:**

1. Fix the condition that decides whether a message is collapsed — it is currently either always collapsing regardless of length, or using a threshold that's far too low (or broken/always-true). It must only collapse an answer when the answer's actual rendered length exceeds a reasonable threshold (e.g., a defined character/line count that corresponds to a response that would otherwise take up a large, thread-dominating amount of vertical space) — short and medium-length answers must render in full immediately with no collapse/expand interaction at all.
2. Confirm the collapse feature still exists and works correctly for answers that genuinely are long (this pattern was correctly present in the original reference design for long responses) — this is a threshold/condition fix, not a removal of the feature entirely.
3. Verify across a range of real answers: a one- or two-sentence answer must render fully with no "See details" prompt; a genuinely long, multi-paragraph or multi-bullet answer should still correctly show the collapsed-with-expand pattern.

---

## 6. Excessive visible scrollbars inside sidebar sections make the layout look unpolished

**Observed behavior:** Each independently-scrolling section (the Sessions list, the Documents list, and the Session Insights panel on the right) shows its own visible vertical scrollbar at all times, which looks cluttered and unpolished rather than clean, even when scrolling isn't actively happening.

**Required fixes:**

1. This is a purely cosmetic scrollbar-styling fix — the underlying independent-scroll-per-section behavior (each pane scrolling on its own, page-level scroll staying locked in the Workspace route) must be preserved exactly as-is; only the _visual appearance_ of the scrollbars themselves changes.
2. Style scrollbars to be minimal/unobtrusive and consistent with the existing dark theme — thin, low-contrast, and ideally only appearing on hover/active-scroll rather than being permanently visible as a thick default-OS scrollbar. Use standard cross-browser scrollbar styling (e.g., `scrollbar-width: thin` plus a themed `scrollbar-color` for Firefox, and `::-webkit-scrollbar` rules for Chromium browsers) so this holds consistently across browsers, not just one.
3. Apply this scrollbar styling to all three independently-scrolling panes (Sessions list, Documents list, Session Insights panel) plus the chat message thread, so the whole workspace has a single consistent, unobtrusive scrollbar treatment rather than each section looking different.
4. Do not change spacing, padding, or the width of any container to achieve this — this is a scrollbar-appearance-only fix, not a layout change.
5. Verify visually in both Chrome/Edge (Webkit-based) and Firefox that scrollbars are present and functional but no longer look like a raw, unstyled default browser scrollbar clashing with the dark theme.

---

## Acceptance criteria for this cycle

- [ ] Background video plays correctly, on first load, on every route (Home, Product, Pricing, About, Workspace) — confirmed via network tab (asset loads) and visual inspection (actually rendering and animating), not just "attribute is present."
- [ ] Uploading a PDF (or any document) never adds any message to the chat conversation thread — processing status is visible only in the dedicated Processing Status bar.
- [ ] The session kebab menu's Rename/Delete dropdown opens snapped directly to its trigger button, for every session row.
- [ ] The chat thread automatically scrolls to show a new answer as soon as it arrives, for every query, without manual scrolling — while not forcibly yanking the view if the user has intentionally scrolled up.
- [ ] Short and medium AI answers render in full immediately with no "See details" prompt; only genuinely long answers use the collapse/expand pattern.
- [ ] Sessions list, Documents list, Session Insights panel, and the chat message thread all use a thin, unobtrusive, theme-consistent scrollbar style instead of a default thick browser scrollbar, in both Webkit and Firefox — with the existing independent per-section scroll behavior and fixed-viewport Workspace layout otherwise completely unchanged.
- [ ] No regressions: page scroll on all routes, the dedicated Processing Status timeline's real-time stage progression, and Session Insights population/scoping all remain exactly as they currently work correctly.
- [ ] No changes to color values, typography, icon set, border-radius, or any component's visual design beyond the specific scrollbar-appearance fix in item 6.
