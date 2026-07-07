# WhatsApp Proactive Architecture

## Scope

Proactive WhatsApp is deterministic. Brain does not decide randomly when to text the user. Backend rule families decide whether a reminder/check-in is eligible, the outbox queues delivery, the local bridge sends it, and Brain handles the user's reply in the existing WhatsApp thread.

Current rule families:

- `memo`: timed memo reminders, overdue follow-ups, and date-only memo time clarification.
- `accountability`: missing wake time, missing previous-night sleep start, and missing Shower/Creatine/Skin habit logs.

## Inbound Flow

`POST /api/integrations/whatsapp/inbound` validates the bridge secret and sender allowlist, canonicalizes the sender id, then routes the message into the shared Brain pipeline. WhatsApp uses one persistent backend Brain thread per canonical sender. Raw sender ids such as `@lid` are preserved in metadata for debugging.

If a recent proactive message exists and the WhatsApp reply is a short proactive intent such as `fatto`, `ok`, `9.30`, `domani`, `piu tardi`, or `?`, proactive reply resolution can run before an unrelated pending action. This prevents an old pending confirmation from stealing a reply to a fresh reminder/check-in. Generic pending cancellations such as `no`, `annulla`, or `cancella tutto` still stay with the active pending action unless the message clearly names the proactive target. New explicit commands still bypass proactive context and route normally.

## Outbox Flow

The bridge calls the combined endpoint `POST /api/integrations/whatsapp/outbox` with `action=evaluate|poll|ack`.

- `evaluate`: runs proactive rules and enqueues due messages idempotently.
- `poll`: expires stale queued rows, reclaims stale claimed rows, claims due queued rows, sorts by priority rank (`high`, `normal`, `low`), and returns bridge-sendable messages.
- `ack`: records `sent` or `failed` delivery result and persists sent proactive messages into the WhatsApp Brain thread.

## Outbox States

Allowed transitions are explicit in `api/_utils/brainOutboxStateMachine.js`:

- `queued -> claimed`
- `claimed -> sent`
- `claimed -> queued` retry
- `claimed -> failed`
- `queued -> expired`
- `claimed -> expired`
- `queued/claimed -> cancelled`
- `sent -> sent` idempotent

Unsafe transitions such as `queued -> sent`, `expired -> sent`, `failed -> sent`, and `cancelled -> sent` are rejected.

## Stale Claim Recovery

If the bridge crashes after polling but before ACK, claimed messages are recovered on the next poll after the reclaim timeout. Recoverable rows go back to `queued`; expired rows become `expired`; rows at max attempts become `failed`.

## Proactive Replies

`api/_utils/brainProactiveReplies.js` resolves short replies deterministically. It selects the latest proactive target by `metadata.expected_reply_type` and dispatches to memo or accountability logic without Gemini/planner guessing.

Memo cases support:

- `fatto` / `done` / `ok`
- `annulla` / `cancel`
- `snooze 30` / `piu tardi` / `domani` / `alle 18`
- `?` / `perche` / `explain`

Stale reminders ask which reminder to update. Multiple active reminders ask for disambiguation. No database write happens for stale or ambiguous short replies.

If a proactive message is missing its source memo id, replies return a read-only clarification and do not produce write-looking action metadata.

Accountability cases support:

- habit nudges: `si`, `fatto`, `fatta`, `presa`, `done` logs the habit for today with current Europe/Rome time;
- habit nudges with `alle 18.30` log that explicit time;
- wake-time nudges: `9.30`, `9:30`, or `ora` update today's `wake_time`;
- sleep-start missing nudges: `2.30` logs the previous-night sleep start through the canonical sleep-start helper;
- `non ancora`, `non so`, or `boh` acknowledges and does not write;
- `non ho dormito` acknowledges and does not force a sleep-start value;
- `piu tardi`, `tra 30 min`, `in 1 ora`, or `later` creates a lightweight snoozed outbox row when the WhatsApp sender is available;
- unclear replies ask a short clarification and do not write.

Accountability replies update Health through existing backend helpers only after a clear reply. They must not create memos/calendar events, call Vault, or route through the planner.

## Sender Canonicalization

Configure `LIFEOS_WHATSAPP_ALLOWED_SENDERS` with the stable canonical sender. If WhatsApp exposes both `@lid` and `@c.us`, add aliases:

```text
LIFEOS_WHATSAPP_SENDER_ALIASES=39XXXXXXXXXX@c.us=111780936298528@lid
```

Allowed-sender validation accepts the canonical sender or its aliases, then stores the canonical sender for thread/outbox continuity. Without aliases, behavior remains exact-match.

## Attention Budget

`brain_proactive_rules` remains the preference foundation. Rule-level config controls enabled state, quiet hours, max per day, and minimum gap. A `global` rule row can cap attention across proactive families.

Accountability candidates carry a metadata attention profile:

```json
{
  "quiet_hours_bypass": true,
  "max_per_day": 20,
  "min_gap_minutes": 20
}
```

This bypasses quiet-hours suppression for accountability only, raises the candidate-level daily cap, and lowers the min gap. It does not loosen memo reminder defaults. Idempotency and duplicate suppression still apply.

## Proactive Accountability v1

Rule module: `api/_utils/brainProactiveAccountability.js`.

Scheduling uses deterministic jitter inside Europe/Rome local windows. The same user/date/rule/source gets the same scheduled time and idempotency key.

Default windows:

- Wake time missing: morning after `10:30`, afternoon after `15:00`, evening after `20:00`.
- Previous-night sleep start missing: morning after `09:30`, afternoon after `14:00`, evening after `21:00`.
- Shower missing: afternoon window `15:00-20:59`, evening window `21:00-23:30`.
- Creatine missing: afternoon window `14:00-19:59`, evening window `20:00-23:00`.
- Skin missing: evening window `21:00-23:29`, late window `23:30-23:59`.

Stable source ids:

- `habit:shower:YYYY-MM-DD`
- `habit:creatine:YYYY-MM-DD`
- `habit:skin:YYYY-MM-DD`
- `wake_time:YYYY-MM-DD`
- `sleep_start:YYYY-MM-DD`

Candidate metadata includes `expected_reply_type = "accountability"` and an `accountability` object with kind, field/habit id, local date, optional sleep date, window key, and target count.

## Future Rule Families

New proactive rule families should plug into `proactiveRuleRegistry` in `api/_utils/brainProactiveRules.js` and return validated candidates with:

`channel`, `recipient`, `body`, `priority`, `rule_key`, `source_type`, `source_id`, `idempotency_key`, `scheduled_for`, `expires_at`, and `metadata`.

Do not add AI guessing for short proactive replies. Add deterministic target selection, expiry windows, idempotency, attention profile behavior, and tests first.

## Debugging

Run pure regression coverage with:

```bash
npm run test:brain
```

Run the live backend outbox smoke only with explicit opt-in:

```bash
LIFEOS_RUN_LIVE_OUTBOX_SMOKE=true npm run smoke:whatsapp:outbox
```

Use MCP tool `get_whatsapp_proactive_debug` or resource `lifeos://whatsapp/proactive-debug` to inspect recent outbox statuses, ACK/retry metadata, and proactive traces without adding a frontend admin UI.

Manual accountability QA after deploy:

1. Ensure today's Shower count is missing.
2. Run outbox `evaluate` with debug after the shower window.
3. Confirm an `accountability_habit_missing` outbox row is queued.
4. Poll/send/ack through the bridge and receive `Doccia fatta oggi?`.
5. Reply `si`.
6. Confirm today's `health_logs.hygiene.shower.count` increments and the same window does not enqueue again.
7. Repeat for wake time with reply `9.30` and for previous-night sleep start with reply `2.30`.
8. Test `piu tardi` and confirm a snoozed outbox row is queued rather than an immediate duplicate.

## Bridge Runtime

Production bridge runtime is an Oracle VM process managed by PM2, not Docker. Useful commands:

```bash
pm2 status
pm2 logs lifeos-whatsapp-bridge
pm2 restart lifeos-whatsapp-bridge
pm2 save
```

A Vercel backend deploy does not require a bridge restart unless bridge code or bridge env vars changed.
