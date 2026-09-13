---
name: sync-glossary
description: Explore and sync the GLOSSARY.md file that defines the domain terms used in the project.
disable-model-invocation: true
---

# Write Glossary

Explore a codebase's domain model and produce a `GLOSSARY.md` that gives every specialized or ambiguous term a single, tight, authoritative definition.

A glossary here means: an alphabetical list of the specialized, technical, or domain-specific terms that this codebase's model uses to talk about its business - not a list of programming concepts.

## Where the file goes

- **Whole repo / single project**: `docs/GLOSSARY.md` at the root.
- **Monorepo with multiple services**: one glossary per project, at `apps/<project-name>/docs/GLOSSARY.md`.

## Process

1. **Find the domain model, not the framework code.** Look for the core business logic. Skim folder names like `domain`, `models`, `core`, `entities` first; treat `controllers`, `infra`, `adapters`, `utils`, `config` as secondary evidence at best.
2. **Collect candidate terms.** Pull terms from: class/type names, key fields with domain meaning, enum values, domain event names, method names that encode business rules (e.g. `reconcile`, `settle`, `void`), comments/docs that define concepts, and existing README or ADR files in `docs/decisions/`.
3. **Filter aggressively.** For each candidate, ask: _is this a concept unique to this context, or a general programming concept?_ Drop anything that's just infrastructure or a generic pattern (timeouts, retries, generic error types, repository/factory/singleton-style patterns, generic CRUD verbs) even if it's used constantly. Keep only terms that carry business meaning specific to this domain.
4. **Resolve synonyms — be opinionated.** When you find multiple words for the same concept (e.g. `Customer` vs `Client`, `Cancel` vs `Void`), pick whichever the codebase actually favors (most common in code/tests, or most recent/most central) as the canonical term, and list the rejected synonym(s) under `_Avoid_` beneath that term's definition.
5. **Group when clusters emerge.** If terms naturally cluster (e.g. Payments, Fulfillment, Identity), use subheadings under `## Glossary`. If everything belongs to one cohesive area, keep it a flat alphabetical list — don't force subheadings that don't earn their keep.
6. **Write tight definitions.** One or two sentences. Define what the term IS (its nature/role in the model), not what it does or how it's implemented. No code samples, no field lists.
7. **Sort alphabetically** within each section (or within the flat list if ungrouped).

## Rules

- Use the format in [GLOSSARY_FORMAT.md](./GLOSSARY_FORMAT.md).
- Be opinionated: one canonical term per concept, synonyms demoted to `_Avoid_`.
- Definitions are one or two sentences, describing what the term IS, never how it's implemented or what it does step by step.
- Exclude general programming concepts entirely, even heavily-used ones — only terms unique to this domain belong.
- Group into subheadings only when natural clusters emerge; otherwise use a flat list.
- If a GLOSSARY.md already exists at the target path, treat this as an update: preserve entries that are still accurate, revise ones that drifted from the code, add new terms, and remove terms no longer present in the domain — don't just append blindly.

## After writing

Briefly tell the user which file(s) were created/updated, how many terms are in each, and any ambiguous terms you flagged so they can confirm your call.
