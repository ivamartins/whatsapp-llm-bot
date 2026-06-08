# Skills Index

This project follows the **Anthropic Skills convention** for organizing
agent capabilities. Each skill is a folder under `skills/<skill-name>/`
containing a `SKILL.md` file with YAML frontmatter (name, description,
version, tags, triggers, allowed_tools) and a Markdown body.

## Available skills

| Skill              | Purpose                                                       | Tool use | Refs                                                          |
| ------------------ | ------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `whatsapp-reply`   | Natural, tone-aware WhatsApp replies                          | no       | -                                                             |
| `legacy-query`     | Translate NL → legacy ERP/CRM calls (orders, customers, etc.) | yes      | [spec/legacy-erp/](../spec/legacy-erp/), [tools/](../tools/)  |
| `summarizer`       | Condense long texts into 1–3 sentence WhatsApp summaries      | no       | -                                                             |
| `translator`       | pt-BR ↔ en ↔ es with tone preservation                        | no       | -                                                             |
| `scheduler`        | Schedule / list / cancel calendar events from chat            | yes      | [mcp/servers/google-calendar.mcp.json](../mcp/servers/google-calendar.mcp.json), [tools/scheduler.tool.json](../tools/scheduler.tool.json) |

## Adding a new skill

1. `mkdir skills/<your-skill-name>/`
2. Create `skills/<your-skill-name>/SKILL.md` with the standard frontmatter.
3. If it needs tool calls, add a JSON schema under `tools/<your-skill>.tool.json`.
4. If it talks to a backend, add an OpenAPI 3.1 spec under `spec/<backend>/openapi.yaml`.
5. If it goes through MCP, add a manifest under `mcp/servers/<server>.mcp.json`
   and list it in `mcp/mcp.json`.

The loader (`src/prompts.js` → `loadBotPrompts`) auto-discovers any
`SKILL.md` under `skills/` and concatenates it into the system prompt.

## Skill lifecycle

- v1.x — current. Loaded by default in `system.md`.
- v0.x — experimental; mark as `deprecated: true` in frontmatter.
- Removed — keep the folder, replace `SKILL.md` content with a stub that
  says the skill is retired, so old logs/configs don't break.
