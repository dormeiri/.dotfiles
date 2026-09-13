---
name: read-task-description
description: "Read Port's task description for more context. Use when discovering context for idea, research, spec, or implementation work."
disable-model-invocation: true
---

## Get task identifier

1. Check if the user has provided a task identifier already.
2. Check branch name for a task identifier. Branch format: `task_<id>/<some-name>`.
3. If task identifier not found, ask the user for the task identifier.

## Read description

Read the task description from Port MCP or Port CLI, use the task identifier to fetch the task.

If task description is empty, dummy or a placeholder, ignore it.

With Port CLI:

`port api entities get task task_<id> | jq '{title: .title, description: .properties.description}'`

If Port CLI is not available, use Port MCP tool `list_entities`: Blueprint `task` where identifier is `task_<id>`. Include properties `title` and `description`.
