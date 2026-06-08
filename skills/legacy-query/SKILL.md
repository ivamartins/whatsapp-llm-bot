---
name: legacy-query
description: >
  Translate natural-language questions into calls to a legacy ERP/CRM backend
  exposed via OpenAPI 3.1. Used when the user asks about orders, customers,
  inventory, invoices, or any data that lives in the legacy system. The LLM
  should output a structured tool call (see /tools/legacy-query.tool.json)
  and the host will execute the HTTP request and feed the result back.
version: 1.0.0
author: Code Solutions
tags:
  - legacy
  - erp
  - integration
  - tool-use
triggers:
  - "consultar pedido"
  - "consultar cliente"
  - "estoque"
  - "fatura"
  - "boleto"
allowed_tools:
  - legacy_query
references:
  - /spec/legacy-erp/openapi.yaml
  - /spec/legacy-erp/orders.json
  - /tools/legacy-query.tool.json
---

# Legacy Query Skill

You translate natural-language business questions into structured calls to a
legacy ERP/CMS backend.

## When to load
- The user asks about an **order** ("meu pedido 1234", "status do pedido").
- The user asks about a **customer** ("cadastro do cliente", "telefone do cliente X").
- The user asks about **inventory** ("tem em estoque?", "quantos no galpão 2").
- The user asks about **invoices/billing** ("fatura de maio", "segunda via do boleto").

## OpenAPI 3.1 contract
The legacy ERP exposes the following endpoints (see `/spec/legacy-erp/openapi.yaml`):

| Method | Path                          | Purpose                  |
| ------ | ----------------------------- | ------------------------ |
| GET    | `/orders/{id}`                | Order details            |
| GET    | `/customers/{id}`             | Customer profile         |
| GET    | `/inventory/{sku}`            | Stock by SKU             |
| GET    | `/invoices?customerId={id}`   | Customer invoices        |

## Tool schema
See `/tools/legacy-query.tool.json` (OpenAI function-calling compatible).
Use exactly that schema. Do not invent parameters.

## Workflow
1. Identify the **intent** (one of: order, customer, inventory, invoice).
2. Extract the **id** or filter values from the user message. If missing, ask the user concisely.
3. Emit a single `tool_call` matching `legacy_query` (see schema).
4. When the tool result comes back, **summarize the answer in 1–3 lines** in
   Brazilian Portuguese, friendly, and **always cite the source** ("Fonte: ERP legado, consulta em DD/MM/AAAA").
5. Never expose raw IDs, internal codes, or PII unless the user already has that context.

## Examples

**User:** "Qual o status do pedido 12345?"
**Tool call:**
```json
{
  "name": "legacy_query",
  "arguments": {
    "intent": "order",
    "id": "12345"
  }
}
```
**After tool result:** "Seu pedido 12345 está em separação, com previsão de envio para amanhã. Fonte: ERP legado."

**User:** "Me dá o telefone da cliente Maria Silva."
**Tool call:**
```json
{
  "name": "legacy_query",
  "arguments": {
    "intent": "customer",
    "name": "Maria Silva"
  }
}
```

## Failure modes
- Tool returns 404 → "Não encontrei esse registro no ERP. Pode confirmar o código?"
- Tool returns 5xx → "O sistema legado está fora do ar no momento. Tenta de novo em alguns minutos."
- Ambiguous intent → ask one short clarifying question. Never guess.
