# Community and public profiles

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Public boards and individual enrollment are separate. Both new and existing accounts start unenrolled/hidden regardless of Workout Sharing. Global enrollment, profile/lifetime progression, exercise participation, notes and feed sharing are independent controls. Read-time privacy immediately revokes visibility. No automatic historical profile exposure.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Keep Command / Community / Training / Companion / More. Add Rankings beside
Feed and Members within Community. Ranking overview is the selected competitive-
standing-first direction: current league/RP, score explanation, leaderboard
preview; lifetime progression remains one tap away. No sixth primary tab.

Profile first viewport: existing username/avatar, optional equipped title, current
league and lifetime level, three optional featured badges. RP and lifetime XP are
secondary compact values; peak league inside details, not a giant second hero.
Reuse existing signed-avatar service; never copy email/auth metadata into public
identity or make storage buckets public for rank decorations.

## Privacy transition (owner-approved)

New complete accounts: rankings_visible=true, show_progression=true,
exercise_rankings_visible=false, share_milestones=false. Naming a movement on an
exercise board needs this extra opt-in even when aggregate rankings are public.
Existing members: if an explicit rankings preference
exists preserve it; otherwise sharing OFF/missing/corrupt preferences => ranking
hidden, sharing ON => ranking visible after clear release disclosure. No public
row until profile username is complete. The two sharing flags stay independent:

| Workouts | Rankings | Result |
|---|---|---|
| OFF | OFF | Private training/progression only |
| OFF | ON | Public rank aggregates; no workout contents/notes |
| ON | OFF | Shared eligible workout projections; no leaderboard identity/score |
| ON | ON | Both surfaces, notes still follow separate explicit preference |

rankings_visible=false hides all public score/level/title/badge projections from
rank APIs, member profile rank fields and search/pinned rows immediately at read
time. Private XP continues. show_progression=false hides profile level/XP/badges
and All-time XP board eligibility, but does not hide explicitly public RP on
Global/Consistency/Progress; explain the two controls.
Members who require all progression private should disable rankings as well.
No anonymity promise while opted into public boards. No exercise list or dates
are exposed by opt-in to aggregate ranking alone. Sharing notes is never inferred.

Settings copy: "Your ranking, league and opted-in progression are visible to
signed-in members. This does not publish your workout details. Turn off to hide
your ranking without losing private progress." Notes copy remains separate.
The opt-out is a direct switch, no guilt warning or requirement to abandon XP.

## Feed milestones

Workout Feed behavior remains unchanged. Add a future optional milestone item
type only for first-time Level10/25/50, first Diamond/Apex and the first progress
badge, explicitly shared via a preview action. No automatic sharing default.
Never post daily XP, every set, every promotion after churn or inactivity losses.
Idempotency key user:rule_version:achievement_code:first_unlock; revocation makes
its projection inaccessible immediately. No RP/XP for sharing, reactions or views.
Maximum one newly shared milestone per member per seven calendar days; show
private unlock immediately even if a share is declined or capped.

Do not implement following, reactions, invitations, messaging, paid cosmetics or
new social identity fields in v1. A synthetic-member profile in the prototype is
not a newly created auth account or production public record.
