# Spec Index

This folder holds the **OpenAPI 3.1 contracts** for every external backend
the bot can talk to. Each backend has its own folder; `openapi.yaml` is the
canonical description, and a sibling `<resource>.schema.json` (JSON
Schema 2020-12) may be provided for tooling that prefers raw JSON Schema
over YAML.

## Available specs

| Backend       | Path                                  | Status     |
| ------------- | ------------------------------------- | ---------- |
| Legacy ERP    | [`legacy-erp/openapi.yaml`](./legacy-erp/openapi.yaml) | 1.0.0 |
| Legacy ERP    | [`legacy-erp/orders.schema.json`](./legacy-erp/orders.schema.json) | 1.0.0 |
| CRM           | [`crm/openapi.yaml`](./crm/openapi.yaml) | 1.0.0 |

## Why OpenAPI 3.1

- The LLM reads the spec to know **what endpoints exist, what params are valid, and what the response shape looks like**. We embed summaries in the `SKILL.md`, but the spec is the source of truth.
- The MCP server (see `../mcp/`) implements the same contract — `paths`, `operationId`, and schemas match 1:1.
- Validators (`swagger-cli`, `redocly`, `oasdiff`) can be wired into CI to catch breaking changes.

## Adding a new backend

1. `mkdir spec/<backend-name>/`
2. Drop `openapi.yaml` (start from the [OpenAPI 3.1 init template](https://spec.openapis.org/oas/v3.1.0)).
3. Optionally drop `<resource>.schema.json` for shared components.
4. Reference the spec from a skill (`SKILL.md` → `references: [/spec/<backend>/openapi.yaml]`).
5. If the backend should be exposed as a tool, also add a `<backend>.tool.json` in `/tools/`.
6. If the backend should run as a sidecar process, add a `<backend>.mcp.json` in `/mcp/servers/` and register it in `/mcp/mcp.json`.
