# ADR Format

- Location: `docs/decisions/`
- Filename: `NNNN-short-description.md` (e.g., `0042-use-kafka-for-events.md`)
- Sequential numbering: Scan `docs/decisions/` for the highest existing number and increment by one

## Template

```markdown
# ADR-NNNN: Short Descriptive Title

## Context

Brief summary of what forced this decision? Technical constraints, team needs, product goals, uncertainties.

## Decision

One or two sentences. Direct and concise.

## Rationale

Trade-offs that picked this over alternatives. Reference forces from Context. Honest about uncertainty.

## Alternatives Considered

**A - Name**

- What: ...
- Pros: ...
- Cons: ...

**B - Name**

- What: ...
- Pros: ...
- Cons: ...

## Consequences

**Positive:** ...

**Negative:** ...

**Follow-up decisions required:** ...

## References

Links, citations, related ADRs, etc.

## Confidence Level

- High: Very confident in this decision, low risk of needing to change.
- Medium: Some uncertainty, may need to revisit if conditions change.
- Low: Significant uncertainty, likely to need reevaluation.
```

## Clarifying questions

If user AFK: Include confidence level and conditions that would trigger reevaluation when relevant.

Otherwise: Ask clarifying questions to ensure the decision is well-informed and documented.
