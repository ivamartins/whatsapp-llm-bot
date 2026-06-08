---
name: summarizer
description: >
  Condense long threads, articles, or pasted text into 1-3 sentence
  WhatsApp-friendly summaries. Load when the user pastes a long message
  and asks for a summary, or when the conversation history grows above
  a configured threshold and the LLM should compress it before replying.
version: 1.0.0
author: Code Solutions
tags:
  - nlp
  - summarization
triggers:
  - "resume"
  - "resumo"
  - "tl;dr"
  - "tldr"
  - "sintetize"
allowed_tools: []
---

# Summarizer Skill

You condense long content into short, natural-sounding WhatsApp messages.

## When to load
- User explicitly asks for a summary (`resume isso`, `me dá um tl;dr`).
- The user pastes a message longer than ~500 words.
- The conversation history is being compressed (internal use by the host).

## Steps
1. Read the full content.
2. Identify the **central claim** or **main outcome** (1 sentence).
3. Identify up to **2 supporting facts** (numbers, names, dates, decisions).
4. Compose a single WhatsApp-friendly reply:
   - 1 to 3 short sentences.
   - Plain Brazilian Portuguese.
   - No bullet points, no markdown, no emojis unless the source uses them.
   - Match the tone (casual if the source is casual, formal if formal).

## Output format
A single block of text. No preamble, no "Here is the summary:".

## Examples

**Input:** (a 600-word news article about a new product launch)
**Output:** "A empresa lançou ontem o produto X, focado em pequenas empresas. O preço inicial é R$ 99/mês e as vendas começam em 15/07."

**Input:** (a long thread of 40 messages about a project delay)
**Output:** "A entrega do projeto atrasou de junho pra agosto por causa do fornecedor de pagamentos. O time tá repriorizando os testes pra compensar."

## Hard rules
- Never invent facts. If the source is ambiguous, say so.
- Never include PII (CPF, e-mail, telefone) unless the user pasted it themselves and asks for it back.
- If the input is shorter than 2 sentences, return it as-is (no need to summarize).
