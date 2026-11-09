# Training curl identity review

> Archived preliminary review. Superseded by the owner's explicit EZ-bar
> confirmation and `../LIFEOS_RELEASE_READINESS.md`. The pending reconciliation
> now unifies the confirmed history; the unresolved-equipment discussion below
> is historical context, not a current implementation instruction.

## Confirmed local catalog facts

| Canonical ID | Slug | Equipment | Current catalog status |
| --- | --- | --- | --- |
| `860c2371-8592-5ad9-aa43-805984020e52` | `barbell_curl` | Straight barbell | Inactive; saved references remain resolvable |
| `a2bc1c95-14c7-558d-a56b-0973cc4793dd` | `ez_bar_curl` | EZ bar | Active |

The catalog incorrectly names the active EZ movement **Barbell Curl** in English
and **Curl con bilanciere** in Italian. The distinct equipment and IDs do not
justify merging these records. The same labels/status are visible in the applied
catalog-revision migration; no migration was edited or replayed.

## Correction implemented

Training's ID-aware presentation displays the EZ identity as **EZ-Bar Curl** /
**Curl con bilanciere EZ**. This applies to the shared exercise picker trigger,
template plan, catalog/recent options, accessible names, and Training's recorded
set displays. Saved straight-bar IDs retain their straight-bar identity and
labels. Saved `exercise_id = null` entries retain their original text. Selection
callbacks, exercise IDs, templates, snapshots, sets and ownership are unchanged.

The render regression first failed on the saved EZ ID, then passed for both
languages, the inactive saved straight-bar ID, and an unmapped custom record.
No production records were queried or changed during this correction.

## Exact remaining ambiguity / limitations

- A historical set tagged with the EZ ID but called **Barbell Curl** could have
  been performed with either implement. The saved ID alone cannot establish the
  actual physical movement. The UI now labels that ID honestly, but it does not
  certify the correctness of earlier identity assignment.
- Historical text-only **Barbell Curl** / **Curl con bilanciere** records are not
  evidence of straight versus EZ equipment. Keep their nullable IDs/text intact
  until the owner supplies record-specific or cohort-specific evidence.
- The global catalog's bare-text resolver still favors the active EZ canonical
  name. No global resolver, catalog seed or canonical ID was changed here.
- The inactive straight-bar identity remains available through saved references
  and template plans, but not as a new active catalog-search result. Restoring
  that catalog availability is a separate catalog-policy correction, not a safe
  reason to relabel or remap existing EZ records.
- Last Time intentionally remains separated by canonical identity. Combining
  two fragmented histories requires verified physical equivalence plus a
  separately reviewed, owner-scoped reconciliation; this patch makes no such
  unsupported claim.

No schema rerun required. Physical-history reconciliation remains unresolved
where equipment cannot be established from approved evidence.
