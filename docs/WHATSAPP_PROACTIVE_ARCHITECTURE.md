# WhatsApp Proactive Architecture

## Scope

Proactive WhatsApp v1A is deterministic and memo-only. Brain does not decide when to text the user. Backend rules decide whether a reminder is eligible, the outbox queues delivery, the local bridge sends it, and Brain handles the user's reply in the existing WhatsApp thread.

## Inbound Flow

`POST /api/integrations/whatsapp/inbound` validates the bridge secret and sender allowlist, then routes the message into the shared Brain pipeline. WhatsApp uses one persistent backend Brain thread per sender. Pending actions are checked first, then proactive WhatsApp replies, then normal Brain routing.

## Outbox Flow

The bridge calls the combined endpoint `POST /api/integrations/whatsapp/outbox` with `action=evaluate|poll|ack`.

- `evaluate`: runs proactive rules and enqueues due messages idempotently.
- `poll`: expires stale queued rows, reclaims stale claimed rows, claims due queued rows, and returns bridge-sendable messages.
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

## Future Rule Families

New proactive rule families should plug into `proactiveRuleRegistry` in `api/_utils/brainProactiveRules.js` and return validated candidates with:

`channel`, `recipient`, `body`, `priority`, `rule_key`, `source_type`, `source_id`, `idempotency_key`, `scheduled_for`, `expires_at`, and `metadata`.

Do not add AI guessing for short proactive replies. Add deterministic target selection, expiry windows, idempotency, and tests first.
