# Project Progress Reliability QA

## Reconstructed workspace (2026-10-01)

Projects now have an All/Active filter and an actual active-session resume row.
Details prioritize session target/proof and LifeOS Watch; desktop places these
side by side. Manual progress, recorded effort/start date, session history and
project money remain in clearly named expandable sections. Money shows all loaded
entries, not just the first six. Edit/delete targets are 44px. Project and money
editors are native modal dialogs with Escape handling and explicit focus return;
closing is blocked while their save is in progress. Failed deletions stay visible
and report an error. Back/project switching confirms before discarding an unsaved
session/progress draft, then clears that draft to prevent cross-project reuse.

Run `npm run test:ui -- tests/ui/projects.spec.js tests/ui/project-watch.spec.js`.
Isolated browser journeys cover filters/empty state, active-session resume and
parallel-session prevention, create/edit, start/end/proof/delete, manual progress,
money create/edit/delete, failed deletion, draft switching and seven-size captures
of list/detail/money/editor. Fixtures do not replace the real database progress
trigger: the transactional checks below and `npm run test:schema` remain required.
Watch uses the existing authenticated typed actions route; permission and Attention
semantics are unchanged. No schema rerun required.

Manual mobile QA: navigate Projects, select a real project, start a session with
target output, record proof and end it. Expand records/history/money and verify all
persisted entries remain reachable. Edit a project with the on-screen keyboard,
close by Cancel/Escape and verify focus returns. Physical iPhone keyboard behavior
is not proven by Chromium viewport captures.

Apply [RELIABILITY_RELEASE.md](RELIABILITY_RELEASE.md) first. Close old clients before installing the trigger; they used to increment progress from React and would double-count.

1. Create a non-hour project with a baseline total, then start a session with delta 2. Open sessions contribute zero.
2. Complete the session: total increases by 2 once. Reload and repeat saving unchanged data: no additional increment.
3. Edit the completed delta to 4: total increases by 2, not 4. Reopen: contribution is removed. Recomplete and delete: each transition reconciles its contribution transactionally.
4. Edit title/notes without changing delta or end state: total is unchanged. Two independent session completions must add both contributions.
5. Hour goals remain duration-derived; numeric deltas must not increment their stored total.
6. Manual `current_value` changes are a rebase. Existing historical drift is not automatically repaired. If removing a contribution would make the total negative, the session change fails and the user must reconcile the manual total first.
7. New session dates use Europe/Rome when the form opens. Preserve an in-progress edit across midnight.

Database authority: `reconcile_project_session_progress` in `supabase/releases/reliability.sql`, also present in the fresh schema. Frontend session mutations reload project totals rather than applying their own increment. Run `npm run test:schema` for insert/complete/edit/reopen/delete checks. Production RLS, old PWA coexistence, and concurrent clients require staging QA.
