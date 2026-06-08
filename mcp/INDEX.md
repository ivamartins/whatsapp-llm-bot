# MCP Index

This folder holds **Model Context Protocol (MCP)** configuration for the
external tool servers the LLM can call. MCP is Anthropic's standard for
giving LLMs structured access to tools, resources, and prompts via a
sidecar process (typically over stdio).

## Layout

```
mcp/
├── mcp.json                       # root manifest (compatible with opencode + Claude Desktop)
└── servers/
    ├── legacy-erp.mcp.json        # our local MCP server (implements spec/legacy-erp)
    ├── legacy-erp.mcp.js          # stub implementation (replace with real MCP server)
    ├── google-calendar.mcp.json   # reference Anthropic MCP server (npx)
    └── crm.mcp.json               # our local MCP server (implements spec/crm)
```

## Root manifest

[`mcp.json`](./mcp.json) is the entry point. It mirrors the shape expected
by **opencode**, **Claude Desktop**, **Cursor**, and other MCP-aware
hosts. Each server entry declares how to spawn the sidecar and which
environment variables to inject (with `${env:VAR}` interpolation so
secrets stay in the shell).

To enable the CRM server, edit `mcp.json` and set `crm.enabled = true`
after providing the `CRM_API_KEY` env var.

## Per-server manifests

Each `*.mcp.json` in `mcp/servers/` is a richer, **per-server** manifest
that documents the server's:

- name, version, description
- transport (always `stdio` in this project)
- `command` + `args` used to spawn the process
- `env` block (with `${VAR}` placeholders)
- `capabilities` (tools / resources / prompts)
- `tools` list with name, description, and (when relevant) the
  OpenAPI `endpoint` it implements — this lets you auto-validate
  that the MCP server matches the spec in `/spec/`.

## Adding a new MCP server

1. `mkdir -p mcp/servers/`
2. Create `mcp/servers/<name>.mcp.json` following the schema above.
3. (optional) Drop `<name>.mcp.js` with the actual MCP server implementation
   (use `@modelcontextprotocol/sdk`).
4. Register the server in `mcp/mcp.json` under `mcp.servers`.
5. Reference it from a skill via `references: [/mcp/servers/<name>.mcp.json]`.

## Why this structure

- **Separation of concerns:** `/spec/` is the human/contract source of
  truth, `/mcp/` is the runtime wiring, `/skills/` is the LLM-facing
  prompt layer. Each can evolve independently.
- **Discoverability:** a new contributor can read `skills/INDEX.md` →
  follow the `references:` block → find the spec and MCP manifest.
- **Testability:** the MCP manifests are JSON and can be linted / loaded
  in tests without spinning up any process.

See https://modelcontextprotocol.io for the protocol spec.
