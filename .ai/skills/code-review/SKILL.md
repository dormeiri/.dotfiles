---
name: code-review
description: "Review a git diff for coding standards, operational excellence, and spec compliance."
---

# Code Review

Run each section as a separate sub-agent against the git diff and the intent. Once the sub-agents finish, aggregate their findings into a single report.

Documented repo standards (`CODING_STANDARDS.md`, `REVIEW.md`, `AGENTS.md`) override this checklist. Skip anything tooling enforces.

## 1. Interface

- **Input**: git diff (PR, branch, commit range)
- **Check**: `Name: smell → fix`.
- **Finding**: `file:line`, check name, reason, fix. Every finding is a judgement call, not a hard violation.

## 2. Find documented resources

1. Task reference in the branch name, commit messages, or PR title/description (read it with the task tracker's skill, if one is installed).
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

## 3. Run the sub-agents

### Sub-agent #1: Coding Standards

The prompt for this sub-agent should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline below** pasted in full inside `<baseline>` tags (the sub-agent has no other access to it).
- The brief, inside `<brief>` tags: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

<baseline>
- **Mysterious Name**: name doesn't reveal intent, or uses an _Avoid_ term from `GLOSSARY.md` → use the canonical term.
- **Duplicated Code**: same logic in more than one place → extract and share.
- **Feature Envy**: method uses another object's data more than its own → move it to that object.
- **Data Clumps**: same fields travel together → bundle into one type.
- **Primitive Obsession**: primitive stands in for a domain concept → give it a type.
- **Repeated Switches**: same branching on the same type in several places → polymorphism or one shared map.
- **Shotgun Surgery**: one change needs scattered edits → co-locate what changes together.
- **Divergent Change**: one module changes for unrelated reasons → split it.
- **Speculative Generality**: abstraction for needs the spec doesn't have → inline it.
- **Message Chains**: caller navigates a chain of objects → hide the walk behind one method.
- **Middle Man**: unit mostly delegates → call the target directly.
- **Refused Bequest**: subtype ignores most of what it inherits → use composition.
</baseline>

### Sub-agent #2: Operational Excellence

The prompt for this sub-agent should include:

- The full diff command and commit list.
- **the smell baseline below** pasted in full inside `<baseline>` tags (the sub-agent has no other access to it).
- The brief, inside `<brief>` tags: "Report, per file/hunk where relevant, (a) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls. Skip anything tooling enforces. Under 400 words."

<baseline>
- **Race Condition**: concurrent read-then-write on shared state → atomic conditional write, or serialize on one key.
- **Performance Bottleneck**: hot path does unbounded or slow work → move off the hot path, batch, or bound it.
- **CPU and Memory Usage**: holds or computes more than needed → stream or page, release early.
- **Redundant Queries**: same data fetched repeatedly or per item → fetch once, or batch.
- **Error Handling**: failure swallowed, leaks internals, or leaves partial state → typed error, compensate, log with context.
- **Indexing and Query Optimization**: query not covered by an index, or index with no query → align indexes with queries.
- **Logging and Observability**: no logs, or logs without context → add structured logs with context.
</baseline>

## Sub-agent #3: Spec Compliance

The prompt for this sub-agent should include:

- The diff command and commit list.
- The path of the spec, or its fetched contents inside `<spec>` tags.
- The brief, inside `<brief>` tags: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

<baseline>
- **Missing Requirements**: spec asks for something that isn't in the diff → note it.
- **Partial Requirements**: spec asks for something that is only partially implemented → note it.
- **Scope Creep**: diff implements something the spec didn't ask for → note it.
- **Incorrect Implementation**: spec asks for something that is implemented incorrectly → note it.
</baseline>
