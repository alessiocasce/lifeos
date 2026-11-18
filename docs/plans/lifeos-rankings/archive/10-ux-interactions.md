# UX, navigation and completion integration

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

The current completion prototype preserves the actual saved-workout success hero, Back to training, overview, grouped sets, View history and five-destination dock. Rewards are inserted after the primary action. Loading/success/unavailable are independently inspectable through ?rewards=. No Back to Rankings is the primary completion action.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

## Navigation map

```
Community -> Rankings overview -> Global board -> Filters -> category board
                        |             |                       |
                        v             +-> Existing member profile
                   Score details                 |
                        |                        +-> Badges / Customize (owner)
                        +-> Lifetime progression
Training completion -> reward attachment -> Score details -> return origin
```

Use the existing Community hash/history-state mechanism; attach category,
exercise_id, query, snapshot/cursor and scroll origin to each entry. Back from
member restores board/list; reload restores owned current state; copied links
without history return to Rankings. Never change activeWorkoutId when browsing.
Account-keyed mounting and request generations are mandatory. Deep-link rewards
return to the actual completion origin only if still selected and owned.

Rows are >=56px with 44px buttons, integer positions/points, explicit units.
Filters list Global / All-time / Consistency / Progress / Exercise. Selection is
visible and announced; selecting Exercise opens canonical catalog selection,
not free-text fuzzy identity. Search does not autofocus and open an iPhone
keyboard unexpectedly. Profile and filter titles wrap, not shrink with viewport.

## Twelve screen contracts

1. Overview: current league/RP/next threshold, 28-day label, Score breakdown,
   four-member preview, View all and lifetime entry.
2. Global: category label, search, filter action, paginated rows, pinned viewer.
3. Filters: five distinct metrics, exact windows, context choice for Exercise.
4. Lifetime: level/total XP, exact next-level numerator/denominator, milestones.
5. Rank: three component numerators/caps, aging explanation and placement reason.
6. Public profile: existing identity, selected title, level/league, pinned badges.
7. Badges: unlocked/locked, exact conditions in dialog, no invented rarity rates.
8. Customize: live title/frame/accent preview, max three pins, explicit visibility.
9. Promotion: new league, actual current RP and delta from previous snapshot;
   not a fixed "points earned" claim, explicit close/return.
10. Achievement: exact earned condition, optional pin action, no bonus XP.
11. Return: lifetime retained, current provisional/inactive state, neutral CTA.
12. Training: additive reward attachment only; current completion structure stays.

Prototype scenes are separate synthetic state fixtures: normal 760 RP, an example
promotion to 812 (+52), and a long-inactive return at 0. They are not a single
live chronological account. Future production uses the response's actual score.
The prototype's Explore screens index and isolated state links are QA navigation,
not proposed permanent production controls. No fake OS chrome is added.

## Completion integration contract

Workouts remain saved ONLY by the existing successful completion mutation. After
that success, request private progression status using the persisted workout ID.
`{status:'updating'|'ready'|'unavailable', source_revision, xp_delta, xp_total,
level, rp, rp_delta, current_tier, unlock_events[], as_of, rule_version}`.
RP delta compares snapshots and may be negative because old activity aged; do
not label a negative value as a punishment for this workout.

The backend validates ownership. status=ready must match the workout revision;
older responses are ignored. Display rewards updating while stale, retry at 2,
5,10 seconds then stop and provide Refresh. Never block Back to training/History,
retry workout creation, or replace the saved-success state with a scoring error.
No successful persisted completion => no reward-ready claim. The current app
does not implement a durable offline set queue; drafts remain drafts. A future
offline save receipt may show "Saved on device; rewards after sync", not awarded XP.

Consume each owner-view celebration by server unlock_event_id once, recording
acknowledgment privately. Browser-local state alone is not cross-device dedupe.
Show at most one summary celebration per completed workout, group additional
unlock cards, and never replay on History edits/backfill/retries. Zero-credit
workout: "Workout saved" remains; omit +0 splash, optionally show the exact
cap/eligibility reason in reward details. No forced reward modal during logging.

## Failures, accessibility and mobile

Use existing LifeOS confirmation dialogs for leaving dirty customization or
revoking visibility; do not introduce native confirm/alert. Cancel receives safe
focus, Escape restores trigger, errors retain draft, busy blocks duplicates.
Read-only boards are never unsaved work. On public opt-out failure keep the
switch's saved state and explain it was not changed; never claim privacy success.

Respect safe area exactly once, opaque portal dock, content bottom clearance,
16px editable inputs to avoid iOS zoom, internal dialog scroll, reduced motion,
and >=4.5:1 normal-text contrast. Physical iPhone/PWA verification is a later
engineering acceptance step, not inferred from a desktop screenshot.
