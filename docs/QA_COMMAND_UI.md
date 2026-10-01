# Command UI QA

Command uses the existing authenticated context datasets. It performs the existing
today/tomorrow calendar read and no mutations. Training and project blocks lead
when active. Today agenda and up to four dated open memos follow; completed work
and recorded health appear below. Tomorrow shows up to two calendar commitments.
Remaining lists are accessible through the corresponding screen links.

No spend cards, invented insights or missing-health nags. Actual zero sleep is
shown as recorded data. A calendar/memo refresh error is reported separately from
an empty day; cached rows stay visible. Dates and project-session day matching
use Europe/Rome helpers, independent of browser timezone.

Run `npm run test:ui` for isolated browser QA. The Command tests cover quiet and
calendar-failure states, cancelled/closed filtering, actual recorded sleep, active
Training resume and horizontal overflow at all seven requested viewport sizes.

Manual QA after deploy: verify today's real calendar and memos, follow each link,
resume the intended workout, scroll Recorded today above the fixed mobile dock,
then test an empty day and a failed refresh. Test local Rome midnight rollover.
No schema rerun required. This UI does not change Brain/WhatsApp/MCP behavior.
