# Reconstruction requirement audit

Audit baseline: `4358a76`; date: 2026-10-02. This maps the original 45 sections,
not a smaller replacement brief. Source code and executed tests outrank docs.
It separates implementation evidence from physical/deployment evidence.

## Original scope

| Brief item | Authoritative evidence | Current judgment |
| --- | --- | --- |
| 1. Inspect current system | Source comparisons, reconstruction commits, `UI_FEATURE_PRESERVATION.md` | Source-led reconstruction; backend changes are limited to the authenticated app-control seam. |
| 2. Product reality | CompanionState, ProjectWatch, HealthRoutineState; bounded `companionApp` projection | Intelligence appears as current state/Watch, not primary database/admin tables. |
| 3. Training priority | Shell five-destination navigation; WorkoutTab logger hierarchy | Training is prominent; utilities are secondary. |
| 4. Draft-loss bug | Old local form versus `useWorkoutDraft` and continuity regression suite | Draft/session/workspace persistence implemented; physical iOS caveat below. |
| 5. Process death | Synchronous input persistence, versioned user/session keys; reload/remount tests | Full reload recovery tested; actual iOS eviction not tested. |
| 6. Draft semantics | Workout save/end/delete paths; continuity/history tests | Confirmed save preserves exercise/load; failed save retains draft; session cleanup is tested. |
| 7. Active mode | Active header, logger, Shell resume dock; layout/shell tests | Live work precedes setup/history; resume remains explicit. |
| 8. Resume hydration | Same-user auth preservation and pageshow/online/visibility reconciliation in LifeOSContext | Cached visible state and draft survive simulated reconnect/token refresh. |
| 9. Routes | Existing lightweight paths; `shouldResumeTraining`; back/forward tests | Direct routes and explicit navigation win; root launch resumes only eligible live Training. |
| 10. Visual reconstruction | CSS tokens, shared UI, all tab captures | Obsidian/steel/cold white; no glow or ornamental HUD. Latest muted-text correction retains this grammar. |
| 11. Typography | Sans content; tabular Training numbers/telemetry | Large legible logger values; no viewport-scaled font size. |
| 12. Mobile | Four phone-size suites, safe-area CSS, keyboard event-order tests | Browser geometry/focus tested; physical keyboard/safe areas still manual. |
| 13. Desktop | Rail, responsive Training/Command/Projects layouts; three desktop sizes | Context beside execution instead of stretched mobile navigation. |
| 14. Home | HomeTab + Command tests | Active work, dated commitments, recorded context; quiet absence and honest read failures. |
| 15. Projects | ProjectWatch + typed backend service + project/Watch tests | Watch enable/suspend/resume/retire and project context are accessible. Terminal Watch renewal remains deliberately unsupported. |
| 16. Companion | Conversation-first workspace/context sheet; Companion/report/detail tests | Conversation, memory, reports, history and current context preserved. |
| 17. Autonomy | Independent permission checkboxes and authenticated permission action | Explicit MONITOR/MESSAGE changes; neither permission inferred by viewing a screen. |
| 18. Health | HealthTab/current-routine projection + health tests | Current routine state is separate from selected-date habit counts; corrections prepare unsent Companion text. |
| 19. Utilities | Calendar/Memos/Finances tests and code | Existing CRUD/status/date/category capabilities preserved behind More/rail. |
| 20. Design system | CSS tokens, shared UI, native dialogs/sheet, Shell | Coherent surfaces/focus/status/control grammar without new runtime abstraction framework. |
| 21. Motion | CSS reduced-motion override and existing short transitions | No new animation library or input-blocking choreography. |
| 22. Feedback | Workout success status after confirmed save; failure tests | Immediate visible confirmation; no dependency on unsupported haptics. |
| 23. Network | Draft retention, busy locks, errors, reconnect tests | No false saved result; no automatic offline write queue. |
| 24. Accessibility | Native-dialog focus/dismissal tests; suggestion keyboard tests; workspace height/contrast checks | Meaningful keyboard/label/focus coverage; not a WCAG certification. |
| 25. Performance | Lazy tabs; production build sizes; package comparison | No runtime image/video/canvas/animation dependency; Playwright is test-only. |
| 26. Backend contracts | Baseline diff of api/supabase/services; full npm test | Existing Brain/WhatsApp/MCP/OAuth routes unchanged; narrow typed app seam reused. |
| 27. Function count | `npm run check:functions` | Exactly seven. |
| 28. PWA updates | PullToRefresh live-session guard; waiting-worker browser test | Update cannot silently reload live Training; deployed worker activation remains manual. |
| 29. Local state | workoutContinuity version/age/sanitization/user cleanup tests | 36-hour expiry, corrupted/unavailable storage tolerated, no credentials persisted by the new contract. |
| 30. A-H matrix | workout-continuity.spec.js; pure continuity tests | Save/reload, unsaved draft, exercise switch, end/new, users, failure, launch and navigation agency covered. |
| 31. Manual mobile QA | QA_WORKOUT.md/QA_FULL_APP.md; browser journeys | Browser-supported portions performed. Actual lock/background/eviction on iPhone remains explicitly unverified, as permitted by the brief. |
| 32. Visual QA | Seven-size tab suites and viewed captures | All required dimensions captured/reviewed through reconstruction checkpoints. Latest Training contrast captures re-reviewed at all seven. |
| 33. Coherent implementation | Git checkpoint sequence; source/test evidence | Working implementation across all surfaces, not a mockup or design essay. |
| 34. Preservation | UI_FEATURE_PRESERVATION.md workflow matrix + feature suites | Named workflows have code and regression evidence; original bounded history limits are disclosed. |
| 35. No mock regression | Production service imports unchanged; fixtures isolated by QA server | Production UI uses Supabase; browser fixture values are test-only, not shipped metrics. |
| 36. Monitor security | companionApp tests + consolidated route auth | Supported typed project staleness only, verified user, ownership/permissions, no direct message send. |
| 37. Human state UX | routineState helper + Companion/Health tests | Active/Paused/No longer current/Not certain; raw backend status hidden from primary UI. |
| 38. Command restraint | HomeTab and quiet/populated Command tests | No Money/admin/activity dump or missing-data nag. |
| 39. Priority order | Training continuity first; implementation commit sequence | Training reliability was not traded for decoration. |
| 40. Gates | npm test includes every named focused suite; UI suite/build/functions/syntax/diff gates | Final combined browser run passed 225; npm test/build/functions passed. Final diff/staging checks recorded below. |
| 41. Existing work | Git status and explicit staging | Deployment QA and OAuth smoke edits remain separate. |
| 42. Git | Coherent checkpoint commits on main; no unauthorized push | Audit/text-contrast checkpoint follows the implementation sequence; unrelated smoke edits excluded. |
| 43. Documentation | Project context, per-module QA, progress/preservation docs | Final report and evidence map distinguish implemented behavior from unverified deployment/device behavior. |
| 44. Final report | Required 23 deliverables in original brief | UI_RECONSTRUCTION_REPORT.md contains all 23, including exact file groups, commits, QA boundaries and screen descriptions. |
| 45. Outcome | Real logger + reload continuity tests + seven-size captures | Implemented locally; subjective owner acceptance and physical iPhone journey cannot be asserted from Chromium. |

## Latest cross-workspace check

`tests/ui/workspace-audit.spec.js` waits for each actual screen, then samples its
visible enabled buttons/summaries, runtime errors, horizontal overflow and the
two muted text utilities. Backgrounds are alpha-composited through ancestors for
these solid-color text checks. It does not evaluate every color/hover state,
screen-reader workflow or physical keyboard. Dedicated feature tests cover
dialogs, failures, populated records and mutation journeys.

Before the text correction, 12 of 16 mobile/desktop samples failed: examples
included Training date (4.03:1), kg (3.94:1), calendar Today (4.03:1), habit and
empty-state text. Text-only utilities now use `--muted` / `#89919b`; surfaces and
disabled controls are not lightened. Expanded checks passed on all 56 route/size
combinations. This is measured evidence, not a claim that a screenshot alone
proves contrast.

## Final local validation

- `npm run test:ui`: 225 passed, terminal exit 0 (7.2 minutes).
- `npm test`: terminal exit 0, including all focused gates named in the brief.
- `npm run build`: terminal exit 0; 28 precache entries, 821.33 KiB.
- `npm run check:functions`: terminal exit 0, seven routes.
- Changed-test `node --check` and `git diff --check`: passed. Backend was unchanged
  in this final checkpoint; prior backend syntax/schema-backed gates passed.
- Final staging/diff checks passed; unrelated deployment-QA/OAuth-smoke edits
  remain unstaged.

Local implementation/audit is complete, not production acceptance. Keep physical
iOS/PWA, live Supabase CRUD, production Watch delivery and Gemini explicitly
unverified. No schema rerun required; deployment/push is not authorized by the
reconstruction goal. The 23-part report is UI_RECONSTRUCTION_REPORT.md.
