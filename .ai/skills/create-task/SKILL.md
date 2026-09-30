---
name: create-task
description: Create tasks and deliverables in Port's planning system. Use when users ask to create a task, add a task, create a deliverable, log work, or add something to an iteration.
disable-model-invocation: true
---

# Create Task / Deliverable

Don't ask questions, just do. Write details after you finish so I can decide what to do next.

## Step 1: Parallel lookups

Run ALL simultaneously before asking anything:

1. `list_entities` (task) — search duplicates using title/description keywords
2. `list_entities` (team_iteration) — filter `iteration_status != Completed`; always include Backlog iterations (title contains "Backlog") for the user's team
3. `describe_user_details` — resolve the logged-in user's team
4. `list_entities` (deliverable) — relevant deliverables from request keywords
5. `list_entities` (roadmap_item) — relevant roadmap items
6. `list_entities` (project) — relevant projects

## Step 2: Resolve iteration

- User mentioned one → search it and use the `team_iteration` identifier found
- User said "none" or skipped → use the team's Backlog `team_iteration` (title contains "Backlog" for user's team)

## Step 3: Create the task

Use `trigger_run` with identifier `create_a_task_for_the_iteration` (DAY-2 on `team_iteration`). Set `entityIdentifier` to the resolved iteration from Step 2.

Key inputs:

| Input                                | Value                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `title`                              | user's title                                                                                                                 |
| `description`                        | Expand into Problem Statement / Solution Overview / Technical Approach; always start first line with `> ⚠️ **AI GENERATED**` |
| `status`                             | `"Not started"`                                                                                                              |
| `priority`                           | `"High"` (default)                                                                                                           |
| `expected_size`                      | `"M"`                                                                                                                        |
| `planned`                            | `false` if the iteration status is `Current`, otherwise `true`                                                               |
| `create_deliverable`                 | `false` if related deliverable found, otherwise `true`                                                                       |
| `deliverable`                        | existing deliverable identifier if attaching; omit otherwise                                                                 |
| `Is this a task or an internal bug?` | `"Task"`                                                                                                                     |

## Step 4: Show important info

Present one consolidated message:

```
🔍 **Possible duplicates:** <list with title + status + link, or "None found">

📦 **Other related deliverables:** <list with title + status + link, or "None found">

🛣️ **Other related roadmap items**: <list with title + status + link, or "None found">

📖 **Other related projects**: <list with title + status + link, or "None found">
```

> ⚠️ Never use `upsert_entity` on `task` or `deliverable` blueprints to create a new task/deliverable. Reserve `upsert_entity` on `task` or `deliverable` for updating existing tasks/deliverables only.

## Step 5: Confirm

Reply with:

```
✅ Done!
- **Task:** [<title>](https://app.getport.io/taskEntity?identifier=<identifier>)
- **Deliverable:** [<title>](https://app.getport.io/deliverableEntity?identifier=<identifier>)  ← omit if none
- **Iteration:** [<title>](https://app.getport.io/team_iterationEntity?identifier=<identifier>)

TASK_ID: <task identifier>
```

The `TASK_ID:` line must be the last line, plain text with no formatting, holding the created task's identifier: tools parse it to find the task.

## Key rules

- Always include the Backlog iteration in options — label it clearly as "Backlog"
- If user provides iteration/deliverable/roadmap item upfront, use it
- Filter iterations by the user's team — don't ask for team unless nothing can be inferred
- Default priority: `High`; default expected_size: `M`
- Always report duplicate check result and other related entities, even if "None found"

## Tools Reference

Use Port MCP, if not available, try using /port-cli. If neither is available, report that the request cannot be completed.

| Tool                                                 | Purpose                                      |
| ---------------------------------------------------- | -------------------------------------------- |
| `list_entities` (task)                               | Duplicate detection                          |
| `list_entities` (team_iteration)                     | Upcoming iterations + Backlog                |
| `list_entities` (deliverable, roadmap_item, project) | Context lookups                              |
| `describe_user_details`                              | Resolve user's team                          |
| `upsert_entity` (deliverable)                        | Create new deliverable                       |
| `trigger_run` (`create_a_task_for_the_iteration`)    | **Create task**                              |
| `list_self_service_triggers`                         | List available action and workflows triggers |
| `upsert_entity` (task)                               | Update existing task only                    |
