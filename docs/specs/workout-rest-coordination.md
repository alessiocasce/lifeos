# Rest-timer coordination

Status: implemented, reviewed, merged to `main` and pushed through `fe8b99c` on 2026-11-17; GitHub tickets #6, #7 and #8 are closed. Production Vercel READY and the public build version were verified for that SHA on 2026-11-17. See [acceptance evidence](../qa/workout-rest-coordination.md) for checks and physical-device/hosted-RLS limits.

This is the first scheduled architecture refactor (candidate #2 in the original report). Template saving and the Brain planner remain separate work. Domain terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Objective and scope

Put rest-timer coordination behind one deep module whose interface is also its test surface. The implementation owns reads, preference changes, notification setup/reconnect, cancellation, mutation exclusion, refresh coalescing, and account/workout isolation. This gives locality to race handling and leverage to callers and tests.

React retains sheet visibility, translated presentation, countdown formatting/ticks, browser-event listeners, and lifecycle attachment. Logout remains owned by `LifeOSContext.jsx`, using the existing adapter. Construction and disposal of the new module do not start network requests or cancel persisted timers.

Keep server deadlines, existing persistence, notification consent, user-gesture permission ordering, transport guards, and network-independent push display. No UI redesign, schema migration, push-worker change, authentication redesign, automatic write retry, or delivery-acceptance claim is part of this refactor.

## Pre-implementation observations (historical baseline)

- `src/components/WorkoutRestTimer.jsx` owns generation checks, mutation exclusion, account/workout scope checks, device-state transitions, and reconnect-then-save ordering. Refresh events are currently discarded during mutations.
- `src/services/workoutRestApi.js` checks the expected owner for saves and reconnects, but reads and cancellation currently capture whichever identity is current without an expected-owner argument.
- `tests/ui/fixtureRestApi.js` supplies the existing adapter interface, but does not model equivalent owner checks, workout-specific cancellation, or asynchronous races.
- The existing account/workout string check can become equal again after A -> B -> A. A distinct module lifetime must keep the original operation obsolete.

These observations describe the pre-refactor source. The implementation reproduced the A -> B -> A browser regression and refresh-loss behavior, then added passing regressions; they are not remaining defects. The knowledge graph recorded at commit `4f88bb6` confirms the Training imports and shared `LifeOSContext.jsx` hub; source inspection supplies runtime ordering that the undirected graph does not establish.

## Public interface

Implemented placement: `src/utils/workoutRestCoordinator.js`, with a thin React adapter in `src/hooks/useWorkoutRestCoordinator.js`.

```js
const coordinator = createWorkoutRestCoordinator({
  userId,
  workoutId,
  adapter,
});

coordinator.getSnapshot();
coordinator.subscribe(listener); // Returns an unsubscribe function.

await coordinator.refresh();
await coordinator.updatePreferences({ enabled, seconds });
await coordinator.setNotifications(enabled);
await coordinator.reconnectNotifications();
await coordinator.cancelTimer();

coordinator.dispose();
```

`userId` and `workoutId` are required and fixed for the instance lifetime. React creates a fresh instance when either changes, disposes the old instance, and starts the initial read after attaching it. An ended workout has no attached coordinator. A distinct lifetime, rather than identity-string equality, determines whether results are still current.

### Snapshot

```js
{
  preference: null, // Last confirmed { enabled, seconds, notifications }.
  timer: null,      // Last confirmed timer, or no timer.
  device: { status: 'checking' },
  loading: false,
  mutation: null,
  refreshError: null,
  mutationError: null,
}
```

- Initial `preference: null` means no confirmed snapshot has loaded. The view must not present default preferences as persisted facts.
- `timer` retains the existing adapter fields, including its absolute `scheduled_for` deadline. Device status retains `off`, `checking`, `ready`, `reconnect`, `blocked`, `unsupported`, `unavailable`, and `unverified`.
- `loading` describes a current read, independently of the active mutation. `mutation` identifies `updatePreferences`, `setNotifications`, `reconnectNotifications`, or `cancelTimer`.
- Errors contain an operation, a stable application-owned code, and a safe user-facing message. Subscription credentials and provider responses are never exposed.
- Snapshots are read-only to callers. `getSnapshot()` returns the same reference until a published change; listeners receive change notifications and read the current snapshot.
- A refresh failure preserves confirmed preferences and timer data. If notifications are enabled, device readiness becomes unverified until it can be checked again.

### Operation results

All five actions return promises with explicit outcomes:

```js
{ status: 'success' }
{ status: 'failure', error }
{ status: 'busy' }
{ status: 'obsolete' }
```

Expected validation, transport, identity, and device failures use `failure` and the corresponding snapshot error, rather than requiring the view to reconstruct coordination from exceptions. A failed operation in an obsolete lifetime must not publish an error into a new lifetime.

`success` means the requested operation was acknowledged. It does not prove physical notification delivery. A mutation result is independent of any subsequent reconciliation failure: the mutation can succeed while `refreshError` reports that readback failed.

### Action behavior

| Action | Contract |
| --- | --- |
| `refresh()` | Read and reconcile this account/workout. Overlapping refresh requests join an existing valid read or the pending post-mutation refresh. |
| `updatePreferences(patch)` | Accept only `enabled` and/or `seconds`; validate before effects and merge with confirmed preferences. Notification setup cannot be invoked through this action. |
| `setNotifications(true)` | From the user gesture, request permission and establish/renew device registration using the existing explicit-enable behavior; then persist notification preference. |
| `setNotifications(false)` | Persist the account-wide opt-out. Keep an enabled foreground countdown independent of notification readiness. Do not detach other devices. |
| `reconnectNotifications()` | Explicitly renew this device's registration and persist notification preference as enabled. No automatic reconnect from refresh. |
| `cancelTimer()` | Cancel this workout's timer under the expected owner; clear the local timer only after acknowledgment or authoritative readback. |

Mutations require confirmed preferences. Calls before initial data is available return an actionable `failure` without side effects. Validation failures also produce no side effects.

## Concurrency and lifetime rules

1. Admit at most one mutation at a time. Further mutation attempts return `busy` immediately; they are not queued. In particular, a permission request must never be deferred behind another operation.
2. Starting a mutation invalidates any earlier read's publication rights. An earlier read cannot overwrite the mutation result or clear its error.
3. A refresh requested while a mutation is active sets one pending refresh. After the mutation finishes, run one fresh read for all requests received during that mutation. Repeated events coalesce; writes are never replayed.
4. Refresh promises joined to that pending read resolve with its outcome. Invalidated earlier reads resolve as `obsolete`. Disposal releases queued refresh requests as `obsolete` without waiting for a future event.
5. Keep mutation exclusion until required post-mutation reconciliation settles. A successful mutation publishes its confirmed change even if readback subsequently fails.
6. `dispose()` is idempotent: detach listeners, invalidate all publication rights, discard pending work, and prevent subsequent commands from starting effects. Such commands return `obsolete`.
7. Before each new asynchronous effect stage, check expected identity and lifetime. An already-sent request may still finish; disposal neither reverses it nor promises server cancellation. It must not trigger the next setup/write stage after becoming obsolete.
8. Switching workout invalidates the old instance even though preferences are account-wide. Switching back creates a new instance that reads current persisted facts.

## Notification partial success and errors

Permission prompting stays directly in the user-gesture call path, before awaited network work. A thin React adapter calls the notification action directly from the control handler; neither an effect nor a queued task starts it.

If registration succeeds but preference persistence fails:

1. Retain the last confirmed preference and publish a mutation failure; device status is initially unverified.
2. Perform one reconciliation read while the lifetime is current. This read can also satisfy refresh requests queued during the mutation.
3. Apply successfully read persisted facts without erasing the mutation failure. If the write reached the server despite a lost response, readback can confirm its persisted value while the original operation still reports failure.
4. Leave device registration in place. Retry is explicit; there is no automatic unregister, reconnect, or preference write.

Successful reads clear only refresh failures. A new mutation attempt replaces the previous mutation failure with the current attempt's outcome; a successful mutation clears it. A failure followed by refresh success therefore remains understandable to the user. Read-only device reconciliation does not prompt for permission or change consent.

## Adapter seam and integration

Use the existing production and fixture implementations at the `workoutRestApi` seam. Align their behavioral contract instead of treating matching method names as sufficient compatibility. The coordinator receives the adapter; it does not create a Supabase client or import browser globals.

Required adapter capabilities:

- Reads and cancellation accept the expected owner, as saves and notification setup already do. Capture and use the validated identity/token for each request, retaining user/workout filtering.
- Multistage notification setup accepts a lifetime check and consults it before starting each subsequent browser or network effect. Preserve direct permission prompting and `userVisibleOnly` behavior.
- If needed, add optional guard arguments to existing methods so current logout callers remain compatible. Update the fixture and real-adapter harness together. Never infer authorization from the coordinator alone; retain existing backend ownership enforcement.
- Keep `detachDevice()` and `detachLocalDevice()` available to existing logout/auth-change callers. Their ownership does not move into the coordinator.

The React adapter subscribes to snapshots and translates the existing matching saved-set, focus, online, visible-document, and subscription-change events into refresh requests. It disposes before accepting results from another account/workout. View code uses snapshot errors and mutation state instead of its own generation, scope, and saving refs.

The implementation may share private helpers internally. Do not introduce a general Training coordinator, merge browser/backend date helpers, or move timer scheduling out of the existing persisted workflow.

## Acceptance tests

Exercise the public interface with a deterministic adapter whose promises can be resolved in a chosen order. Retain real-adapter and browser checks; fixtures alone do not prove production identity or permission behavior.

| Scenario | Required observable outcome |
| --- | --- |
| Initial read succeeds or fails | Snapshot distinguishes unknown preferences from confirmed data; retry is read-only. |
| Read finishes after a mutation starts | Old read cannot publish stale data or clear failures. |
| Multiple refresh events during save/cancel | Exactly one post-mutation read; waiting refreshes receive its result. |
| Two mutation attempts overlap | Second returns `busy` and performs no write or permission prompt. |
| Account/workout changes mid-operation, including A -> B -> A | Old instance publishes no result into the new one and starts no further effect stages. |
| Cancel encounters an account switch | Expected-owner guard prevents cancellation using a different account's current credentials. |
| Reconnect succeeds, preference save fails | Confirmed preference retained until readback; explicit failure survives reconciliation; no rollback or automatic write retry. |
| Mutation succeeds, reconciliation fails | Mutation returns success; confirmed change remains; refresh failure is separate. |
| Notifications off with timer enabled | Foreground countdown remains available; no automatic device renewal. |
| Disposal during a read or queued refresh | No publication or further effects; queued callers settle as obsolete. |
| Permission action from a user gesture | Permission is requested before the first awaited network operation; busy/obsolete actions do not prompt. |
| Production/fixture contract | Equivalent owner guards, workout filtering, result shape, and partial-failure behavior at the exercised seam. |
| Existing browser flow | Preference persistence, saved-set countdown, resume/reconnect, cancel, ended-workout removal, and responsive sheet behavior remain intact. |

## Implementation sequence and completion gate

1. Add the coordinator and deterministic interface tests. Complete the race, lifetime, and partial-failure cases above.
2. Strengthen the existing adapter's owner/lifetime checks and align the fixture contract. Verify real adapter behavior separately from substituted browser fixtures.
3. Attach the thin React adapter and remove duplicated coordination from the timer view. Preserve existing logout ownership and user-facing layout.
4. Update relevant Workout, full-app, and deployment QA checklists to describe implemented behavior. Update the current architecture reference only after implementation.
5. Run focused coordinator, adapter, notification, and browser checks plus repository-required validation. Report any physical-device acceptance separately; deterministic and browser tests cannot establish iPhone display.

Completion requires every acceptance scenario to have a passing check or an explicitly reported unresolved limitation, with no runtime behavior claimed from this specification alone. No schema rerun required. This document does not authorize a commit, push, or deployment.
