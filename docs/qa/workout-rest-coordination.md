# Rest coordination acceptance evidence

Implementation and acceptance for tickets 6-8, 2026-11-17. Merged/pushed to `main` at `fe8b99c`; tickets closed. Production deployment `dpl_7o4x396sDEX2mGhK6dcFvB43qPxs` is READY and the public build-version endpoint returned that SHA on 2026-11-17. The acceptance tests below remain local evidence. No schema rerun required. The real-adapter harness executes production source with substituted auth/database/browser transports; browser checks use the fixture adapter and do not exercise hosted Supabase.

| Approved scenario | Passing local evidence | Limit |
| --- | --- | --- |
| Initial read success/failure and read-only retry | Coordinator unknown/immutable/joined-read tests; browser neutral initial trigger | No hosted data claim |
| Old read completes after mutation starts | Coordinator invalidated-read public-interface test | Controlled transport ordering |
| Many refreshes during save/cancel | Coordinator save/cancel and completion-edge tests; browser saved-set/focus/online coalescing | Browser fixture |
| Overlapping mutations | Coordinator busy exclusion including direct notification action | Controlled transport ordering |
| Account/workout changes, A -> B -> A | Coordinator lifetime tests; adapter owner/stage guards; browser lifetime test | No cross-account production writes |
| Cancel during account switch | Real-adapter delayed identity and captured credential/filter checks; fixture contract | Auth/database substituted |
| Enable/reconnect setup succeeds, preference save fails | Coordinator forced single read, queued joins, lock and retained failure; shared real-adapter/fixture partial contract; browser failed-save controls | No physical permission/display acceptance |
| Lost write response | Coordinator persisted readback retains original failure; real-adapter + fixture lost-response contract; browser checked persisted toggle/error and explicit reconnect | Controlled response loss |
| Partial-success readback also fails | Coordinator separate safe errors and confirmed data; real-adapter/fixture dual-failure contract; browser two alerts and enabled explicit retry | Local failure injection |
| Mutation acknowledged, reconciliation fails | Coordinator acknowledged save/cancel remains success, separate refresh error | Controlled transport ordering |
| Notifications off while timer enabled | Coordinator retains timer; adapter no push transport/unregister; browser timer/automatic setting and device retained | Other devices are not simulated; absence of detach/transport ensures no client removal |
| Dispose during read/queued refresh/partial save/readback | Coordinator immediate obsolete outcomes/no late publication; real-adapter partial-success disposal before/during readback | Already-sent requests may complete |
| User gesture permission ordering | Coordinator synchronous setup call; real-adapter permission before auth/config and per-stage lifetime/owner guards; lifecycle suite | Real iOS user-gesture acceptance remains manual |
| Production/fixture contract | Shared failed/lost/dual save/readback, registration retention, explicit retry and opt-out checks; owner/filter/obsolete checks | Fixture cannot establish RLS |
| Safe error contract and retry | Coordinator operation/owned code/safe messages, adapter wording-change regression and production/fixture notification-code parity; read success retains mutation error, new explicit mutation replaces it; distinct translated save/read alerts in browser | No provider details displayed |
| Existing browser flow and responsive sheet | Push browser persistence/permission/reconnect/offline/countdown/resume/cancel/end tests; dual-error sheet at 360/390/430/768/1024/1440 | Browser emulation only |

Run `npm run test:workout:rest-coordinator`, `npm run test:workout:rest-adapter`, `npm run test:workout:push`, `npm run test:workout:rest`, focused Playwright rest/push/lifetime/continuity tests, `npm run test:brain`, `npm run build`, `node scripts/tools/generate-italian.js --check` and `git diff --check`.

Validation result: all listed Node checks passed; the final focused Playwright run passed 21/21 (push 5, rest coordination 5, lifetime 1, continuity 10). Production build passed with the existing >500 kB chunk warning. Italian dictionary and diff checks passed.

Physical iPhone notification display and deployed RLS remain unresolved acceptance limits, outside this local refactor. Existing unrelated training-prefill-rest Weight locator failures are not changed. The refactor used no schema migration or production data write. Its reviewed commits were subsequently pushed/merged and deployed by Vercel Git integration; that release status does not add physical-device or hosted-RLS acceptance.
