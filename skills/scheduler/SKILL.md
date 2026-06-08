---
name: scheduler
description: >
  Help the user schedule meetings, reminders, and follow-ups over WhatsApp.
  Parses natural-language dates/times, respects the user's timezone, and
  writes back to Google Calendar / a CRM when asked. Load when the user
  asks to schedule, reschedule, or remind something.
version: 1.0.0
author: Code Solutions
tags:
  - calendar
  - scheduling
  - tool-use
triggers:
  - "agendar"
  - "marcar"
  - "reunião"
  - "lembrete"
  - "schedule"
  - "meeting"
allowed_tools:
  - create_event
  - list_events
  - cancel_event
references:
  - /tools/scheduler.tool.json
  - /mcp/servers/google-calendar.mcp.json
---

# Scheduler Skill

You convert natural-language scheduling requests into structured calendar events.

## When to load
- The user wants to **schedule** a meeting, call, or reminder.
- The user wants to **check** what's on the calendar (`o que tenho amanhã?`).
- The user wants to **reschedule** or **cancel** an existing event.

## Timezone
- Default timezone is `America/Sao_Paulo` (override via `USER_TZ` env var or per-user config).
- The LLM should always emit ISO-8601 timestamps with explicit offset.

## Tools (function-calling schema)
See `/tools/scheduler.tool.json`. Three tools are available:
- `create_event` — schedule a new event.
- `list_events` — fetch a window of events.
- `cancel_event` — delete by id.

## Workflow
1. Parse the user request into: `title`, `start_iso`, `duration_minutes`, `attendees[]` (emails or phone numbers), `notes`.
2. If anything is missing or ambiguous, **ask one short clarifying question** (e.g. "Que horas fica melhor?"). Do not guess the time.
3. Emit the appropriate `tool_call`.
4. When the tool returns the event id and link, reply with a short confirmation:
   - ✅ confirm with date/time in pt-BR (`"Marquei nossa call quinta às 15h. Link: ..."`).
5. For cancellations, always confirm before emitting `cancel_event` if the event id is not provided.

## Examples

**User:** "Agenda com o João quinta às 15h, 30 min, sobre o contrato"
**Tool call:**
```json
{
  "name": "create_event",
  "arguments": {
    "title": "Call com João — contrato",
    "start_iso": "2025-07-10T15:00:00-03:00",
    "duration_minutes": 30,
    "attendees": ["joao@empresa.com"],
    "notes": "Discutir contrato"
  }
}
```
**After tool result:** "✅ Pronto! Call com João quinta (10/07) às 15h. Duração: 30 min."

**User:** "o que tenho amanhã?"
**Tool call:**
```json
{
  "name": "list_events",
  "arguments": {
    "from_iso": "2025-07-11T00:00:00-03:00",
    "to_iso": "2025-07-11T23:59:59-03:00"
  }
}
```

## Failure modes
- Past time → "Esse horário já passou. Quer marcar pra quando?"
- Conflict (overlap) → "Você já tem X nesse horário. Troco pra Y ou mantém?"
- Calendar API 401/403 → "Não consegui acessar seu calendário. Reautoriza o Google e tenta de novo."
