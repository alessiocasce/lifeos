# Project Progress Reliability QA

Apply [RELIABILITY_RELEASE.md](RELIABILITY_RELEASE.md) first. Close old clients before installing the trigger; they used to increment progress from React and would double-count.

1. Create a non-hour project with a baseline total, then start a session with delta 2. Open sessions contribute zero.
2. Complete the session: total increases by 2 once. Reload and repeat saving unchanged data: no additional increment.
3. Edit the completed delta to 4: total increases by 2, not 4. Reopen: contribution is removed. Recomplete and delete: each transition reconciles its contribution transactionally.
4. Edit title/notes without changing delta or end state: total is unchanged. Two independent session completions must add both contributions.
5. Hour goals remain duration-derived; numeric deltas must not increment their stored total.
6. Manual `current_value` changes are a rebase. Existing historical drift is not automatically repaired. If removing a contribution would make the total negative, the session change fails and the user must reconcile the manual total first.
7. New session dates use Europe/Rome when the form opens. Preserve an in-progress edit across midnight.

Database authority: `reconcile_project_session_progress` in `supabase/releases/reliability.sql`, also present in the fresh schema. Frontend session mutations reload project totals rather than applying their own increment. Run `npm run test:schema` for insert/complete/edit/reopen/delete checks. Production RLS, old PWA coexistence, and concurrent clients require staging QA.
