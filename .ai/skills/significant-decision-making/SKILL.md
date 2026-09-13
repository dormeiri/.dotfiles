---
name: significant-decision-making
description: When a decision is significant enough, record it in an ADR.
---

# Record Decision

Actively build and sharpen the project's domain model as you design. This is the _active_ discipline: challenging terms, inventing edge-case scenarios, and writing significant decisions down the moment they appear.

## File structure

Most repos have a single context:

```
/
├── docs/
│   └── decisions/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
```

```
/
├── docs/
│   └── decisions/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   └── docs/decisions/                 ← context-specific decisions
│   └── billing/
│       └── docs/decisions/
```

Create files lazily: only when you have something to write. If no `docs/decisions/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'customer': do you mean the Organization or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Criteria

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

Use the format in [ADR_FORMAT.md](./ADR_FORMAT.md).

## Clarifying questions

If user AFK: Include confidence level and conditions that would trigger reevaluation when relevant.

Otherwise: Ask clarifying questions to ensure the decision is well-informed and documented.
