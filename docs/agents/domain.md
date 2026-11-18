# Domain docs

LifeOS uses a single-context layout: `GLOSSARY.md` at the repository root, with architectural decisions under `docs/adr/`.

## Before exploring

Read `PROJECT_CONTEXT.md` for the current architecture and constraints, then the root `GLOSSARY.md` and ADRs relevant to the area being explored. `docs/HISTORY.md` records release rationale.

If a glossary or ADR directory is absent, proceed silently. Domain modeling creates glossary entries when terms are resolved and ADRs when a consequential trade-off warrants one; do not create placeholder decisions.

## Vocabulary and decisions

Use the glossary's canonical domain terms in issue titles, refactoring proposals, hypotheses, and test names. Keep glossary definitions about the domain, rather than implementation details. If a new concept exposes a real vocabulary gap, resolve it through domain modeling.

Respect relevant ADRs. If a proposal contradicts one, identify the ADR and explain the concrete reason for reopening it rather than silently overriding it.

If a root `GLOSSARY-MAP.md` is deliberately introduced later, follow its pointers to the relevant context glossaries and ADRs. Until then, retain the single-context layout.
