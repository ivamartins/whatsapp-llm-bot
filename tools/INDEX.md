# Tools Index

This folder holds **OpenAI-style function-calling tool schemas** (one per
file, or an array of multiple tools in a single file). Each tool is a
JSON document that the LLM can be asked to emit as a structured
`tool_call`, which the host then dispatches to the right backend
(typically via the MCP server in `/mcp/servers/`).

## Available tools

| Tool(s)         | File                                                  | Backed by                                  | Skill                |
| --------------- | ----------------------------------------------------- | ------------------------------------------ | -------------------- |
| `legacy_query`  | [`legacy-query.tool.json`](./legacy-query.tool.json)  | `mcp/servers/legacy-erp.mcp.json`          | `legacy-query`       |
| `create_event`  | [`scheduler.tool.json`](./scheduler.tool.json)        | `mcp/servers/google-calendar.mcp.json`     | `scheduler`          |
| `list_events`   | [`scheduler.tool.json`](./scheduler.tool.json)        | `mcp/servers/google-calendar.mcp.json`     | `scheduler`          |
| `cancel_event`  | [`scheduler.tool.json`](./scheduler.tool.json)        | `mcp/servers/google-calendar.mcp.json`     | `scheduler`          |

## Why split from MCP

- **Tools** = what the **LLM** sees. Optimized for prompt size, clarity,
  descriptions tuned for the model.
- **MCP** = what the **runtime** sees. Optimized for transport, env vars,
  process lifecycle.

A single tool in `/tools/` is almost always a thin wrapper around one
endpoint in `/spec/` and one tool entry in `/mcp/servers/`.

## Adding a new tool

1. Drop `<your-tool>.tool.json` here. Use the OpenAI function-calling
   shape: `{ type: "function", name, description, strict, parameters }`.
2. If it has multiple related tools, store them as a JSON array
   (see `scheduler.tool.json`).
3. Add the matching MCP server in `/mcp/servers/<backend>.mcp.json` (or
   reuse an existing one).
4. Reference the tool from a `SKILL.md` via
   `allowed_tools: [<your_tool>]` and `references: [/tools/<your-tool>.tool.json]`.
5. Validate with `node -e "JSON.parse(require('fs').readFileSync('<file>'))"`.
