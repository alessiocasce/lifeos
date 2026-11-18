# Command / Home Manual QA

Reviewed against `src/tabs/HomeTab.jsx` on 2026-11-17. Use [QA_COMMAND_UI.md](QA_COMMAND_UI.md) and `tests/ui/command.spec.js` for the current UI. Verify required existing database objects; this checklist requires no schema change.

## Agenda and open loops

1. Sign in and create/inspect eligible persisted data in an authorized test scope.
2. Today shows at most five non-cancelled events, sorted by start time with untimed events last. More than five exposes View all; cancelled events are excluded rather than dimmed.
3. Open loops shows at most four open dated memos due today or overdue, with View all when needed. Future/undated memos remain in Memos.
4. Tomorrow shows at most two non-cancelled events. Links open the corresponding workspace; Home does not edit records.
5. Cross Europe/Rome midnight or resume a background tab and verify local-day/range refresh. A calendar/memo failure shows an availability warning independently of an empty day; previously loaded rows stay visible.

## Active and recorded work

1. A live workout exposes a direct resume link to that session. An active project session shows project name/target output and opens Projects.
2. Recorded today shows valid persisted sleep (including an actual zero), logged Shower/Creatine/Skin count/latest time, and counts of completed workouts/project blocks.
3. Do not expect Coffee/ADC, working-set count, volume, moves, total project minutes or a Today Signal card here; these are not current Command components.
4. Completing or deleting records and refreshing must update the corresponding signal. Other users' records/drafts must remain absent.

## Quiet state and separation

1. With no active work, today's events or due memos, show one quiet/loading/unavailable sentence as appropriate, without zero-metric cards or missing-health nags.
2. Empty Today/Open loops/Tomorrow/Recorded sections collapse. Unlogged health/habits do not create empty cards.
3. Expenses stay in Finances; Recent Actions stays in the Companion context sheet. Home has no finance totals, AI-write feed or inferred dashboard insights.
4. A project merely existing must not create an active-work card. A completed block can appear in Recorded today without an invented duration/volume total.

## Validation and limits

Run `npm.cmd run test:ui -- tests/ui/command.spec.js` for isolated fixture checks. Check mobile/desktop overflow and the active Training dock, including 360, 390, 430, 768, 1024 and 1440px where layout changes. These checks do not prove hosted RLS, a physical iPhone lifecycle or production data correctness. Related backend open-loop and project reliability checks live in [QA_PROJECTS.md](QA_PROJECTS.md), [MCP.md](MCP.md) and [RELIABILITY_RELEASE.md](RELIABILITY_RELEASE.md).
