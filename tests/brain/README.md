# Brain Regression Harness

Run:

```bash
npm run test:brain
```

This harness checks deterministic Brain protocol behavior without Vercel, browser automation, WhatsApp, Gemini, or live Supabase writes.

Covered regressions:

- Dirty sleep-start pending actions normalize to `log_sleep_start`.
- Command Draft sleep-start semantics normalize to `log_sleep_start`.
- Stale `missing_fields` do not block a confirmed executable pending action.
- Italian/English pending confirmations, cancellations, and clarification replies normalize correctly.
- Naps remain Health note/context behavior and do not become sleep-start.
- Simple explicit writes skip Brain Vault retrieval.
- Negative write intent wins over action wording.
- Working Context preserves referent date/time for follow-up commands like `aggiungilo anche al calendario`.
- Proactive WhatsApp memo candidates, outbox state transitions, sent-message working context, and memo reply intents stay deterministic.

Live behavior still needs the manual QA checks in `docs/QA_AI_ASSISTANT.md`, especially WhatsApp thread continuity and real tool execution.
