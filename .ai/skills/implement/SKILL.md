---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

User is AFK, implement the work described by the user in the spec or tickets.

Write code comment _only_ when the code cannot be understood without it, in that case explain _why_ it is needed, not what the code does.

Run typechecking and single test files regularly.

For each new test, prove it discriminates: stash the source change (keep the test), run it and confirm it fails, then restore.

Once done, use /code-review to review the work.

Commit your work to the current branch.
