# Leaderboard product contract

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Global: opt-in, coverage-gated RP pilot. All-time: timely earned XP since enrollment. Consistency: eight complete weeks ordered by productive-week count then capped dates (3/week), true ties retained. Progress: unranked milestone collection. Exercise: personal records, competition staged. Do not use the old capped-unit ordered boards below.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

All boards are authenticated-member surfaces, not anonymous SEO pages. Public
profiles already have this audience. No emails, raw private sets, notes, health
measurements or source workout IDs appear in leaderboard payloads.

| Board | Exact primary metric | Eligibility / labeling |
|---|---|---|
| Global | Published integer RP descending | Visible, non-suspended, profile complete, placed; as-of date |
| All-time | Corrected lifetime XP descending | rankings_visible AND show_progression; no activity minimum; lifetime investment, not athletic superiority |
| Consistency | sum(k(age)) over rated dates, capped at 9 | Same placement; display effective days / 9 and 28-day window, not uncapped daily streak |
| Progress | sum of best-two corroborated event weights, capped at 2 | At least one supported event; 28-day corroborated units, not percent strength |
| Exercise | Corroborated units for one canonical ID, capped at 1 | Separate exercise_rankings_visible opt-in, context/metric-eligible event; no raw machine kg or mixed assistance totals |

No absolute strength board in v1. The seven catalog leaderboard_eligible values
are a candidate whitelist, not evidence that every user's setup is comparable.
Rep-performance or future strength tables require their own context/metric key
and cannot be mixed into a single ordered number. An exercise with no eligible
records displays an honest empty state, not a fabricated record.

## Ordering and pagination

Use SQL RANK() over primary metric DESC so ties show 1,1,3. Within a tie order
stable internal user UUID ASC; this does not break the displayed tie. Keyset
cursor = opaque snapshot_id, metric value and stable user key. Page size 25,
maximum 50. Reject cursors for a different category, exercise or snapshot. Do not
compute positions on a paginated client slice. Return the viewer's pinned row
from the SAME full snapshot even when not in the current page/search results.

User search matches public username case-insensitively, debounced 250ms, at most
64 input characters; escaped parameterized ILIKE or prefix index. Search does
not renumber global positions. Category switches reset query, cursor and scroll;
Back restores the previous list query/page depth/scroll. Profile navigation uses
existing Community history-state conventions, not an app-router replacement.

## Refresh and visibility

Publish a daily as-of snapshot after the Europe/Rome rollover, plus reconcile
affected member rows after saved activity. Public browsing uses one immutable
snapshot revision; provide Refresh for a new consistent snapshot. Refresh active
views on focus and at most every 60 seconds; never poll hidden views. Abort or
generation-discard requests on account/category change. Preserve current data
during refresh; label errors and last-as-of, do not show an empty board on timeout.

Position movement compares with the previous available daily snapshot, same
category. If absent, show no arrow, never a fake +0. Opt-outs are checked at read
time; cached snapshots cannot keep a hidden member visible. Redistributing places
after opt-out uses an eligibility-filtered query on the snapshot rather than
returning an old public row. The owner-view private score remains available.

Global inactive accounts remain listed while placed and RP>0, with neutral
inactive indicator after 14 days. At 28 days they leave Global and retain an
All-time position if opted in. Suspended accounts are excluded from all public
boards; private account handling follows existing authorization.

Loading: six stable-height skeleton rows. Empty: No ranked members yet / no
matching members / no comparable records, with a specific reason. Private viewer:
show their own score plus an explicit visibility setting link, no public position.
Disclosure: rankings use self-reported logs and do not verify physical ability.
No recent workout dates or private exercise history in the pinned row.
