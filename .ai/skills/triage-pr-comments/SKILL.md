---
name: triage-pr-comments
description: List a PR's unresolved review comments that still await the author, recommend how to handle each (fix, answer, clarify, or grill), record the triage in a results file, and carry out the user's choices. Use when the user wants to go through, triage, or address PR review comments, or to continue a triage from its results file.
argument-hint: "PR number or URL (optional, defaults to the current branch's PR)"
disable-model-invocation: true
---

The triage lives in `.scratch/pr-<number>-triage.md` so it can continue in a clean session. Keep it current: a fresh agent with only this file and the repo should be able to pick up any open item.

## 1. Collect

Run `scripts/pending-comments.sh [pr]` (next to this file) for the comments awaiting the PR author.

If the results file exists, keep its items and choices, triage only comments whose link isn't in it yet, and skip to step 4 once every item has a chosen action. If nothing is pending or open, say so and stop.

## 2. Research

If the PR has a task and a skill can read it from the task tracker, read the task description once. Group related comments (same concern, or settled by one fix or answer); most stand alone. Research each group in a parallel sub-agent, giving it the comments with their threads in `<comments>` tags, the task description in `<task_description>` tags, the actions below, and the item format. It reads the commented code, the branch diff (`git diff origin/main...HEAD`), uncommitted changes (`git diff HEAD`), and related ADRs in `docs/decisions/`, and returns each item's summary, recommended action with why, and notes. It doesn't edit or reply.

## 3. Triage

Actions:

1. **Fix** - minor and clearly right. Change the working tree in a sub-agent (see step 4); don't commit or push.
2. **Answer** - a question or challenge the task, spec, or an ADR already answers. Reply citing the source, via a sub-agent (see step 4).
3. **Clarify** - unclear what the reviewer wants. Reply asking the unblocking question, with your best reading, via a sub-agent (see step 4).
4. **Grill** - complex, needs investigation or trade-offs. Run `/grill-me` with the item as the subject, record the outcome in `Notes`. Once the session settles, the outcome is one or more of:
   - **Fix** - a change in this PR, made like any other fix.
   - **Reply** - an answer or clarifying question, drafted and posted like any other reply.
   - **Follow-up** - work outside this PR's scope. If a skill can create tasks in the task tracker, create one in a sub-agent and reply with its link; otherwise reply that it's out of scope and list it for the user.

Write the results file:

```markdown
# PR #<number> review triage

PR: <pr url>
Task: <task identifier, or "none">

---

## 1. [ ] <reviewer>: <comment summary text>

- Recommended action: <Fix | Answer | Clarify | Grill> - <one-line why, and for Answer, the source>
- Chosen action: <pending>
- Link: <link to the comment>
- Location: <path>:<line>, or "review body"
- Related: <numbers of items researched together with this one, or "none">

**Comment:**

> <the reviewer's comment, quoted in full, then the rest of the thread, each reply prefixed with its author>

**Notes:**

<the answer and its source, the likely fix, or the open question>

---

## 2. [ ] ...
```

Show the user the list and the file's path:

```markdown
1. - [ ] Comment one-line summary: <reviewer>: <comment summary text>
     - Recommended action: <action> - <why>
     - Link: <link to the comment>
```

Ask them to pick an action per item (e.g. `1 fix, 2 answer, 3 grill`) or accept all, record the picks in `Chosen action`, then ask whether to continue here or in a clean session. For a clean session, tell them to run `/triage-pr-comments` there and stop.

## 4. Act

Work on unchecked items: fixes and reply drafts first, then grill sessions one at a time. Handle related items together.

Make each fix, including ones a grill session settles on, in its own sub-agent so the edits stay out of this session's context. Run them one after another, not in parallel, since they share the working tree. Give each the item from the results file in `<item>` tags; it makes the change, runs checks for the files it touched, doesn't commit, and returns the files changed and a one-line summary.

Don't reply to fixes until they're pushed; list those replies as open. Flag PR description parts a fix made stale.

Replies also go through sub-agents, in two rounds around the user's approval, since posting is visible to reviewers:

1. **Draft**: one sub-agent per reply, in parallel. Give each the item in `<item>` tags; it returns only the reply text. Keep replies to one or two short sentences: answer the question directly, cite the commit or source, and skip thanks, filler, and implementation detail the reviewer can read in the diff (e.g. "Nope, removed in <sha>." or "Fixed in <sha>: onReload now also invalidates `X`, which covers both queries."). Write each into its item as a `**Draft reply:**` section (the drafters run in parallel, so they don't write the file themselves).
2. **Approve**: show the user all drafts together. They approve, edit, or drop each.
3. **Post**: one sub-agent posts the approved drafts and returns each reply's link. Reply to a thread with `gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies -f body='<reply>'`, where `comment_id` is the number after `#discussion_r` in the link; reply to a review body with `gh pr comment <number> --body '<reply>'`, quoting what you answer. Don't resolve threads; that's the reviewer's call.

As each item is done, mark its heading `[x]` and add a `Result:` bullet (files changed, reply link, or what's still open). Finish by replying with the file's path, the updated list, and anything left open.
