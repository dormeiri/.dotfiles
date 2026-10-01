---
name: port-cli
description: Port CLI reference for advanced API calls
---

# `port api call` recipes

Endpoints and request bodies for work the typed subcommands don't cover. Paths are relative to
`/v1` — the CLI appends them to the configured API URL (default `https://api.getport.io/v1`),
so query strings work inline. Remember that `--data` here is an **inline JSON string** (object,
not array) and that supplying it flips the default method to `POST`.

Contents:

- [Searching entities](#searching-entities)
- [Search operators](#search-operators)
- [Pagination](#pagination)
- [Counting and aggregating](#counting-and-aggregating)
- [Self-service actions](#self-service-actions)
- [Self-service workflow triggers](#self-service-workflow-triggers)
- [Action runs](#action-runs)
- [Audit log](#audit-log)

## Searching entities

`port api entities list` only filters by blueprint. Real queries use the search DSL, which takes
a `combinator` (`and` / `or`) and a list of `rules`. Rules nest, so a nested block is itself a
`{combinator, rules}` object.

The per-blueprint endpoint is the one to prefer: it paginates and supports field selection.

```bash
port api call /blueprints/service/entities/search --data '{
  "query": {
    "combinator": "and",
    "rules": [
      {"property": "environment", "operator": "=", "value": "production"}
    ]
  },
  "include": ["$identifier", "$title", "environment"],
  "limit": 200
}'
```

`include` / `exclude` take property and relation identifiers; meta-properties need their `$`
prefix (`$identifier`, `$title`, `$createdAt`, `$updatedAt`, `$team`). Narrowing with `include`
is worth doing on large blueprints — full entity payloads get big fast.

To search across blueprints, use `/entities/search` and add a `$blueprint` rule. Note the shape
difference: this endpoint takes the query object **at the top level**, with no `query` wrapper:

```bash
port api call /entities/search --data '{
  "combinator": "and",
  "rules": [
    {"property": "$blueprint", "operator": "=", "value": "service"},
    {"combinator": "or", "rules": [
      {"property": "environment", "operator": "=", "value": "production"},
      {"property": "environment", "operator": "=", "value": "staging"}
    ]}
  ]
}' --unwrap entities
```

## Search operators

Grouped by the rule type they belong to. Using an operator with the wrong value type is a
common source of 422s — `in` wants an array, `=` wants a scalar.

**String** (`property`, `operator`, `value`): `=`, `!=`, `contains`, `doesNotContains`,
`containsAny`, `beginsWith`, `doesNotBeginsWith`, `endsWith`, `doesNotEndsWith`, `in`, `notIn`.
`in` / `notIn` / `containsAny` take arrays.

**Number** (`property`, `operator`, `value`): `>`, `>=`, `<`, `<=`.

**Date** (`property`, `operator`, `value`): `between`, `notBetween`, `=`. Value is either
`{"from": "<iso>", "to": "<iso>"}` or `{"preset": "..."}` where preset is one of `today`,
`tomorrow`, `yesterday`, `lastDay`, `lastWeek`, `last2Weeks`, `lastMonth`, `last3Months`,
`last6Months`, `last12Months`.

**Emptiness** (`property`, `operator`): `isEmpty`, `isNotEmpty`. No `value`.

**Timer** (`property`, `operator`): `isExpired`, `isNotExpired`. No `value`.

**Relation** (`operator`, `blueprint`, `value`, optional `direction`): operator is `relatedTo`,
`value` is an entity identifier or array of them, `direction` is `upstream` or `downstream`.
This is how you answer "which services depend on X":

```bash
port api call /entities/search --data '{
  "combinator": "and",
  "rules": [
    {"property": "$blueprint", "operator": "=", "value": "service"},
    {"operator": "relatedTo", "blueprint": "package", "value": "left-pad"}
  ]
}' --unwrap entities
```

**Path filter** (`property`, `operator`, `value`): operator is `matchAny`; `property` is
`{"path": [...], "fromBlueprint": "..."}` where path elements are relation identifiers or
`{"relation": "...", "maxHops": n}` with `maxHops` between 1 and 15. Use this for multi-hop
traversal instead of chaining several queries.

**Dynamic values**: in place of a literal, a rule value may be
`{"property": "...", "context": "user"}` or `{"property": "...", "context": "userTeams"}`,
resolved against the caller. Handy for "entities owned by my teams".

## Pagination

The per-blueprint search endpoint returns `next` when more results exist. Feed it back as `from`
and repeat until `next` is absent:

```bash
port api call /blueprints/service/entities/search --data '{"query":{"combinator":"and","rules":[...]},"limit":500}'
# response: {"ok":true,"entities":[...],"next":"<hash>"}
port api call /blueprints/service/entities/search --data '{"query":{...},"limit":500,"from":"<hash>"}'
```

`limit` accepts 1–1000 and defaults to 200. `GET /actions/runs` also supports cursor pagination
via a `next` token. Cap the number of pages you'll fetch, and tell the user when results are
truncated rather than silently returning a partial answer.

## Counting and aggregating

Cheaper than fetching entities and counting locally, and much cheaper on large blueprints:

```bash
port api call /blueprints/service/entities-count          # plain count, GET

port api call /entities/aggregate --data '{
  "func": "count",
  "query": {"combinator":"and","rules":[{"property":"$blueprint","operator":"=","value":"service"}]}
}'
```

`func` options: `count` and `average` (over entities); `sum`, `average`, `min`, `max`, `median`
(over a numeric `property`); `countValues` (grouped by `property`, `relation`, `scorecard`, or
scorecard `rule`). `average` also needs `averageOf` (`hour`/`day`/`week`/`month`/`total`) and
`measureTimeBy` pointing at a datetime property.

`/entities/aggregate-over-time` buckets results over a `timeRange` preset and `timeInterval`
(`hour`/`day`/`isoWeek`/`month`), keyed by `aggregationType` of `aggregatePropertiesValues` or
`countEntities`.

## Self-service actions

```bash
port api call /actions --unwrap actions                              # all
port api call '/actions?blueprint_identifier=service'                # by blueprint
port api call '/actions?action_identifier=deploy-service'            # full detail incl. input schema
port api call /actions/deploy-service                                # same, single action
port api call /actions/deploy-service/permissions                    # who may run it
```

Listing without identifiers gives a summary; requesting a specific identifier returns the full
definition including `userInputs`. Read that schema before building a run body — it is where the
required inputs, enums, and entity-typed constraints live.

Other filters on `/actions`: `operation`, `trigger_type`, `trigger_event`, `published`, and
`version` (pass `version=v2` for the current response shape).

## Self-service workflow triggers

Workflows are the newer self-service model, with no typed CLI commands yet.

```bash
port api call /workflows/self-service-triggers    # triggers this caller can execute
port api call /workflows                          # summary list
port api call /workflows/<identifier>             # full definition: trigger config + nodes
```

Each trigger returns its owning workflow's metadata, a `nodeIdentifier`, and the input schema
from the trigger node's `config.userInputs`. A trigger with `published: false` is disabled and
won't run. Input types mirror action inputs: text, number, toggle, entity, user, team.

Trigger a run:

```bash
port api call /workflows/<workflow-identifier>/runs --data '{
  "nodeIdentifier": "trigger",
  "inputs": {"environment": "staging", "service": "checkout-service"}
}'
```

Then track it:

```bash
port api call /workflows/runs/<run-identifier>                 # status and node runs
port api call /workflows/runs                                  # recent runs
port api call /workflows/runs/<run-identifier>/cancel -X POST  # cancel
```

Node-run logs and input-node responses live under `/workflows/nodes/runs/...`. If a call here
returns 404 or 422, confirm the current shape with `port api call /workflows/<id>` and read the
error `message` — this API is newer than the rest and the most likely to have moved.

## Action runs

```bash
port api call '/actions/runs?active=true' --unwrap runs           # in-flight
port api call '/actions/runs?entity=checkout-service&limit=20'
port api call '/actions/runs?blueprint=service&user_email=me@corp.com'
port api call /actions/runs/<run-id>                              # one run
port api call /actions/runs/<run-id>/logs                         # logs
port api call /actions/runs/<run-id>/approvers                    # who can approve
```

Filters: `entity`, `blueprint`, `action`, `active`, `user_email`, `user_id`, `limit`,
`external_run_id` (your backend's own run id, e.g. a GitHub run), `source` (`UI`/`API`/`AUTOMATION`),
and `version`. Pass `version=v2` when filtering by `action`.

Approve or decline with `PATCH /actions/runs/<run-id>/approval` and
`{"status":"APPROVED"|"DECLINED","description":"..."}` — or the typed
`port api action-runs approve <run-id> --data approval.json`.

To execute on another user's behalf, `POST /actions/<action>/runs?run_as=<email>` — a privileged
operation, so don't add it unless the user asked for exactly that.

## Audit log

Useful for "who changed this entity" and "what ran against this blueprint":

```bash
port api call '/audit-log?entity=checkout-service&limit=50'
port api call '/audit-log?blueprint=service&action=UPDATE&status=FAILURE'
port api call '/audit-log?run_id=<run-id>'
```

Filters include `entity`, `blueprint`, `run_id`, `identifier`, `webhookId`, `origin`
(integration that caused it; `UI` for UI actions), `InstallationId`, `resources`
(`blueprint`/`entity`/`run`/`webhook`/`scorecard`/`action`/`integration`), `action`
(`CREATE`/`UPDATE`/`DELETE`), `status` (`SUCCESS`/`FAILURE`), `actionType`
(`automation`/`self-service`), `from` / `to` as ISO timestamps, `limit`, and `includes` to
select returned fields.
