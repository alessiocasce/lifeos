# Visual design system and selected reference

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED DESIGN HISTORY. Do not implement from this document. See ../PRODUCT-SPEC.md
> for the single current specification and ../FINAL-APPROVAL.md for pending approvals.

## Revision 2 - current proposal, owner approval pending

Concept1 is retained. Completion now follows the actual WorkoutCompleted hierarchy and existing CSS dimensions, not the earlier fragment. New illustration762RP uses executable components450/237/75; XP6420/Level19 remains synthetic. Original760RP captures are version1 evidence. No generated reward amount appears during loading/failure.

The [final corrections](17-final-product-corrections.md) take precedence over conflicting text below.
## Version 1 reference and comparison (superseded where noted)

Owner selected concept 1, saved as screenshots/concept-1-selected.png. Concept 2
is retained as an alternative lifetime-first hierarchy, not a parallel product.
The concept is a raster art-direction reference, not authoritative scoring data.

## Inherit LifeOS

Canvas #0b0d0f, surface #14171b, raised #1b1f24, line #2b3036, ink #f1f3f5.
Use a readable #a2aab6 muted token in new small text; existing muted #939ba5 is
acceptable only where measured contrast passes. Inter/system sans. Letter
spacing zero; no viewport-scaled fonts. App title 18px, screen title 23px,
section 18px, body 14-16px, secondary 12px, metadata minimum 11px. Points use
tabular numerals. Compact RP value 34px; lifetime level can be 64px on its own
focused screen, not in leaderboard rows.

Spacing: 4/8/12/16/20/24/32. Mobile main inset 18px; content-width max720px on
desktop. Lists are unframed with 1px separators, not individual floating cards.
One framed current-rank tool uses radius8px and restrained surface tint. No
cards inside cards, decorative orbs, charts inside every item or dashboard stats.
Primary button cold-white #e7ecf1/#0c1014; configurable app accent is respected
for focus and optional profile accents. Destructive red stays action-specific.

## Emblems and rewards

Platinum's reference shield/star/laurel was generated as a real transparent
bitmap (prototypes/platinum.png), displayed with object-fit contain, 90px main,
28px rows. Source padding means actual occupied artwork is smaller. Other league
identities use coherent Lucide symbols (Shield/Medal/Gem/Crown), not handmade SVG
muscles or decorative text glyphs. Final art production may refine six emblems
without changing names, semantic shapes or points. Every image has a text league
name; no essential distinction relies only on color. Badges use the same library
and a charcoal locked treatment, not tiny unreadable anatomy or gaudy rarity art.

Rank palette is in 04. Teal is a Platinum league detail, not a forced global
theme. Keep current league separate from earned profile frames. User avatar
remains their actual signed image; synthetic prototype uses a neutral Users icon,
not a fake real person's photograph.

## Mobile, motion and states

Keep actual five bottom destinations and select only Community on rank screens.
Use an opaque dock with one safe-area inset and enough bottom content padding;
do not recreate OS time, home bar or a phone bezel. Native editable text stays
16px to avoid iOS zoom. Dialog width min(400px,100vw-28px), max-height
100dvh-60px, internal scroll, Escape/Cancel and focus restoration. Touch targets
44px minimum; rows 56-64px. All long names wrap inside minmax(0,1fr)/min-width0.

Animations optional and <=250ms. Honor reduced motion. Do not repeatedly animate
rank movement on polling. Loading placeholders have fixed row geometry; errors
retain valid current content, with readable Refresh/Retry. Unranked, hidden and
no-baseline are distinct semantic states, not all gray zero cards.

## Fidelity decisions

Preserved selected concept's hierarchy, focused framed rank surface, geometric
emblem, score explanation and scan-friendly rows. Deliberately removed its long
introductory paragraph to avoid wasted first-viewport space. Corrected the image's
double-selected dock and score/emblem inconsistencies. Added lifetime navigation
and isolated prototype index below the core view. The index is not production UI.
The coded progress bar is exact league-band progress, not the concept's arbitrary
fill. Each screen is separate; no unreadable 12-frame montage.
