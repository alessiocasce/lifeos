# WhatsApp Proactive Architecture

## Scope

Proactive WhatsApp v1A is deterministic and memo-only. Brain does not decide when to text the user. Backend rules decide whether a reminder is eligible, the outbox queues delivery, the local bridge sends it, and Brain handles the user's reply in the existing WhatsApp thread.

## Inbound Flow

`POST /api/integrations/whatsapp/inbound` validates the bridge secret and sender allowlist, canonicalizes the sender id, then routes the message into the shared Brain pipeline. WhatsApp uses one persistent backend Brain thread per canonical sender. Raw sender ids such as `@lid` are preserved in metadata for debugging.

If a recent proactive reminder exists and the WhatsApp reply is a short proactive intent such as `fatto`, `ok`, `domani`, or `?`, proactive reply resolution can run before an unrelated pending action. This prevents an old pending confirmation from stealing a reply to a fresh reminder. New explicit commands still bypass proactive context and route normally.

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

`api/_utils/brainProactiveReplies.js` resolves short replies deterministically. Clean single-reminder cases support:

- `fatto` / `done` / `ok`
- `annulla` / `cancel`
- `snooze 30` / `piu tardi` / `domani` / `alle 18`
- `?` / `perche` / `explain`

Stale reminders ask which reminder to update. Multiple active reminders ask for disambiguation. No database write happens for stale or ambiguous short replies.

If a proactive message is missing its source memo id, replies return a read-only clarification and do not produce write-looking action metadata.

## Sender Canonicalization

Configure `LIFEOS_WHATSAPP_ALLOWED_SENDERS` with the stable canonical sender. If WhatsApp exposes both `@lid` and `@c.us`, add aliases:

```text
LIFEOS_WHATSAPP_SENDER_ALIASES=39XXXXXXXXXX@c.us=111780936298528@lid
```

Allowed-sender validation accepts the canonical sender or its aliases, then stores the canonical sender for thread/outbox continuity. Without aliases, behavior remains exact-match.

## Attention Budget

`brain_proactive_rules` remains the preference foundation. Rule-level config controls enabled state, quiet hours, max per day, and minimum gap. A `global` rule row can cap attention across future proactive families. Current v1A memo behavior remains deterministic and conservative.

## Future Rule Families

New proactive rule families should plug into `proactiveRuleRegistry` in `api/_utils/brainProactiveRules.js` and return validated candidates with:

`channel`, `recipient`, `body`, `priority`, `rule_key`, `source_type`, `source_id`, `idempotency_key`, `scheduled_for`, `expires_at`, and `metadata`.

Do not add AI guessing for short proactive replies. Add deterministic target selection, expiry windows, idempotency, and tests first.

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

## Bridge Runtime

Production bridge runtime is an Oracle VM process managed by PM2, not Docker. Useful commands:

```bash
pm2 status
pm2 logs lifeos-whatsapp-bridge
pm2 restart lifeos-whatsapp-bridge
pm2 save
```

A Vercel backend deploy does not require a bridge restart unless bridge code or bridge env vars changed.
