---
name: update-task
description: "Update Port's task description with a summary of the conversation."
disable-model-invocation: true
---

## Get task identifier

1. Check if the user has provided a task identifier already.
2. Check branch name for a task identifier. Branch format: `task_<id>/<some-name>`.
3. If task identifier not found, ask the user for the task identifier.

## Read the task

`port api entities get task task_<id> | jq '{title: .title, description: .properties.description, assignee: .properties.assignee, reporter: .properties.reporter, status: .properties.status}'`

## Assignee and reporter

If assignee or reporter are mssing, fetch the current user's email from Port CLI:

`port api call /profile | jq -r .user.email`

## Status

Only if status is not started, update it to `In progress`.

If the task status is done/deferred/cancelled/continued, ask the user if they want to update the task description anyway.

## Task description

Understand the task from the conversation and update the task description with a summary of the conversation. Check also `specs/` folder. Use the following format:

```
## Problem Statement

## Solution Overview

**Impact level:** {Distruptive / Significant / Minor / Silent}

## Technical Approach

```

If the task description is empty, dummy or a placeholder, update it. If the task description is already filled, ask the user first if they want to update the task description.

## Impact

Based on the task description and the conversation, determine the impact of the change on the user:

- Distruptive: The solution will require significant changes to the user's workflow or system, and may cause temporary disruption.
- Significant: The solution will require some changes to the user's workflow or system, but will not cause major disruption.
- Minor: The solution will require minor changes to the user's workflow or system, and will not cause any disruption.
- Silent: The solution will not require any changes to the user's workflow or system.

## Expected Size

If expected size is missing, based on the task description and the conversation, determine the size of the change:

- XS (Extra Small): Quickwin or trivial change.
- S (Small): Low-risk change that can be completed quickly.
- M (Medium): Has at least one significant/non-trivial change. Requires multiple teams or multiple steps to complete.
- L (Large): Has multiple significant changes or a significant impact for the user.
- XL (Extra Large): Multiple significant changes with a significant or disruptive impact for the user.

## Team Iteration

If team iteration is missing, find the current team iteration with Port CLI:

```bash
port api call --method POST /blueprints/team_iteration/entities/search --data '{
  "include": ["$identifier", "$title", "$team"],
  "query": {
    "combinator": "and",
    "rules": [
      {
        "operator": "=",
        "property": "iteration_status",
        "value": "Current"
      }
    ]
  }
}' | jq -r '.entities' | toon
```

Use `port api call /profile | jq -r .user.email` to get the most relevant team for the current user.

If the user matches multiple teams or doesn't match any team, use the most relevant team for the task description. If unable to determine, ask the user for the team iteration.

## Update task

If human available, ask the user for confirmation, then update the task with the following command:

```bash
port api entities update task task_<id> --data << EOF
'{
  "properties": {
    "status": "<status>",
    "description": "<description>",
    "expected_size": "<expected_size>",
  },
  "relations": {
    "assignee": "<assignee>",
    "reporter": "<reporter>"
  }
}'
EOF
```
