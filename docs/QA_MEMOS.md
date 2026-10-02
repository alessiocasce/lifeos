# Memos Workspace QA

## Reconstruction (2026-10-01)

Memos is a dated queue, not a metrics dashboard. Each reminder appears once.
Overdue rows use restrained amber; today/upcoming remain neutral. Undated notes
are secondary and recent completed/dismissed reminders stay in collapsed history.
All create/edit/delete/done/dismiss/reopen and date/time shortcuts remain available.
Date-less and time-less reminders remain valid; Rome-local grouping is unchanged.

The editor uses a native modal dialog with focus containment and restoration.
Escape/close/cancel cannot dismiss a save in flight. Failed saves retain fields;
status/delete failures display an alert. Important actions are at least 44px.
No Brain/proactive/API/schema behavior changes. No schema rerun required.

## Automated Checks

`npx playwright test tests/ui/memos.spec.js` covers CRUD, done/dismiss/reopen and
reload, optional date/time, failed saves/status, delayed-submit protection, empty
state and list/editor captures at 375/390/393/430/1280/1440/1920 widths.
An undated-only queue regression measures Add Dated Memo at least 44px and opens
the editor with Enter; initial focus is Close, then Tab reaches Remember.
Fixtures are isolated browser storage, not live Supabase or WhatsApp verification.
Run `npm run test:ui`, `npm test`, `npm run build`, `npm run check:functions` and
`git diff --check` for shared-shell/reliability gates.

## Manual Device QA

1. Open More -> Memos while a workout is live; resume dock remains accessible.
2. Add a dated reminder with a time and notes; verify it appears only once.
3. Edit it, clear date/time, and verify it moves to Undated.
4. Mark done, expand history, reopen, dismiss, then delete with confirmation.
5. Open the editor and keyboard on iPhone; reach every field and save/cancel.
6. Simulate a failed request; keep draft and retry without a false success.

Physical iPhone keyboard/PWA behavior remains unverified. Closed history still
uses the existing latest-eight-record limit; no full archive was added. Editor
drafts are not persisted across process death (Training continuity is separate).
