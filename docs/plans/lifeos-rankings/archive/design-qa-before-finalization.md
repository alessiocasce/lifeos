# Design QA and evidence

> Historical archive; not current implementation instructions. Read [PROJECT_CONTEXT.md](../../../../PROJECT_CONTEXT.md) and the parent archive index before using this record.

> ARCHIVED QA FOR EARLIER PROTOTYPE. Current evidence is ../design-qa.md.

## Final result: passed for the isolated design prototype

Selected direction: concept 1, explicitly chosen by the owner. This is design
validation, not acceptance of a deployed Rankings feature or its future SQL.
The source application remains at commit
23a4b6256c9b86b8f8cf64bc458fc3f0429623ac. No production files were edited.

## Reference comparison

Compared the selected generated concept with the rendered overview, competitive
rank detail and customization screen, then inspected each of the other captured
states. The near-black surfaces, restrained steel/teal identity, league emblem,
competitive-first hierarchy, compact leaderboard and secondary lifetime journey
are retained. The real five LifeOS destinations are preserved. The overview
keeps one selected dock destination, not the ambiguous double selection in the
concept image. No fake phone/status-bar chrome is added.

The generated reference is a direction, not a pixel-perfect implementation spec:
its spacious introduction is compressed to fit native 390px LifeOS density; its
decorative league art is reduced to one generated Platinum emblem plus a coherent
Lucide symbol system. The implementation uses real text and semantic buttons.
The configured prototype accent can be changed without changing league identity.

## Captures

The twelve numbered final screenshots in `screenshots/` correspond to:

1. Competitive overview.
2. Searchable global leaderboard and pinned position.
3. Board-category selection.
4. Lifetime XP and levels.
5. Rank, component breakdown and league ladder.
6. Public progression profile.
7. Representative badge collection.
8. Title, frame, accent, featured badges and ranking visibility customization.
9. Promotion event.
10. Badge-unlock event.
11. Return after inactivity.
12. Additive Training completion reward attachment.

Capture names ending `390` identify the requested **390x844 CSS viewport**.
The IAB capture transport scales some raster outputs to 375x811 and others to
390x843. These are original browser pixels, not fabricated or upscaled renders.
The validation checks aspect ratio as well as the independent CSS measurements.
JPEG transport bytes were losslessly decoded into correctly labeled PNG files;
that container conversion does not change the captured layout or image pixels.
The earlier `01-rankings-overview-390.png` is a preliminary capture, not one of
the twelve final numbered route captures. Source Training/Community captures and
both concept images are retained separately.

All five simulation charts were also opened in the browser at 940x520. Titles,
axes, units, legends and synthetic-data disclosure were visually inspected;
the recovery chart was recaptured after an initially incomplete raster render.
SVGs are reproducible quantitative charts, not decorative illustrative evidence.

## Responsive and interaction checks

Final `responsive-checks.json`: twelve routes at each of 375, 390 and 430px,
all with 844px CSS height, for 36 measured states. Every state passed:

- No document horizontal overflow.
- All referenced bitmap assets loaded.
- Visible buttons at least 44px high (fractional-pixel measurement tolerance).
- Navigation dock bottom within one pixel of the viewport bottom.

Exercised overview-to-board navigation, search empty/results states, load more,
board-category selection, member profile selection, own-profile customization,
ranking opt-out, badge dialog and screen-index dialog. Escape closes the dialog
and restores focus. Reload intentionally resets only the synthetic prototype.

Browser checks found two functional prototype defects and they were corrected:
search no longer renumbers the global positions; category selection now changes
both the leaderboard metric and the pinned position metric. The redundant rank
detail self-link was removed. Hot reload now reuses its React root. Historical
development logs contained React hot-reload warnings and one browser-tool injected
animation error; these are not claimed as a clean historical console. A final
fresh document load showed no new captured warnings or runtime errors.

## Numeric parity

The default 760RP / 6,420XP / Level19 scene has an executable golden fixture:
446.428571 consistency + 238.888889 work + 75 progress = 760.317460, rounded to
760. The displayed rounded components are 446 / 239 / 75. Level19 begins at
6,075XP and Level20 at 6,650XP: 345/575 progress and 230XP remaining.

Promotion (812RP) and inactive return (0RP) are independent synthetic event scenes,
not a claim that the default account changed while navigating. The badge screen
contains eight representative designs; the complete twenty-badge product rules
are specified in document08. The exercise filter demonstrates two movements,
not the whole production catalog. Separate exercise-board consent is specified
in the privacy contract, not implemented as authenticated state in this mockup.

## Limits and acceptance boundary

This is an inspectable frontend prototype and arithmetic experiment. It contains
no Supabase connection, API call, credentials, persisted personal data, live
ranking, migration or production integration. It does not prove RLS, worker
delivery, full-history performance or physical iPhone Safari/PWA behavior.
The Training state specifies only the additive reward attachment; it intentionally
does not duplicate or redesign the production workout summary/history.

Physical-device, SQL/RLS, concurrency, timestamp sealing, Cron availability and
real population calibration remain future engineering acceptance gates. See
documents14-16. Passing this design QA does not authorize public launch.
