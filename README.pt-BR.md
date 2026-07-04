# WhatsApp + LLM Bot (LLM-agnostic)

> Parte da linha **Code Solutions Conversational AI Bots**. Bot de WhatsApp LLM-agnostic pronto para produção, com deploy profissional.

Bot de WhatsApp **agnóstico a LLM** que conversa com qualquer API de chat completions compatível com OpenAI (xAI Grok, OpenAI, OpenRouter, Ollama, LM Studio, etc.).

## Resumo em português

- **Diferencial em relação ao `whatsapp-grok-bot`**: nada de CLI Grok, nada de `.grok/agents` ou `.grok/skills`. Apenas HTTP + uma pasta `prompts/` genérica com frontmatter YAML.
- **70 testes** (Mocha + chai), sem rede, sem WhatsApp real, sem API real. Rodam em < 100 ms.
- **Mesmo deploy** do projeto original: PM2, systemd ou Docker. Sessão Baileys persistida em `auth/`.
- **Como usar**:
  1. `cp .env.example .env` e preencher `LLM_PROVIDER` + `LLM_API_KEY`.
  2. `npm install && npm start`.
  3. Escanear o QR code uma vez.
  4. Mande mensagens — o bot responde usando o `prompts/system.md` configurado.

Mantido como exemplo vivo dos serviços de **agentes de IA** e **modernização de sistemas legados** oferecidos pela Code Solutions. Veja também o site: https://ivamartins.github.io/code-solutions-site/

## Por que um projeto separado?

A versão original (`whatsapp-grok-bot`) usa o CLI Grok com `.grok/agents` e `.grok/skills` — é um exemplo histórico de integração `spawn`-based. Esta versão é LLM-agnostic, sem dependência de CLI: qualquer API HTTP OpenAI-compatible funciona.

## Quick start (PT)

**Pré-requisitos:** Node 18+ e uma conta WhatsApp.

```bash
# 1) Instalar
npm install

# 2) Configurar
cp .env.example .env
# Editar .env e preencher LLM_PROVIDER + LLM_API_KEY

# 3) Rodar
npm start
```

Escaneie o QR code uma vez para autenticar. Pronto, o bot responde a mensagens usando o `prompts/system.md` configurado.

## Customizando o cérebro (prompts)

Edite os arquivos em `prompts/`:
- `system.md` — system prompt principal
- `translator/SKILL.md` — exemplo de skill (pt-BR ↔ en ↔ es)
- `persona.md` — opcional, para persona customizada

Veja a referência completa no README em inglês.

## Testes

```bash
npm test
```

70 testes, sem rede, sem WhatsApp real, sem API real. Rodam em < 100 ms.

## Deploy

**Opção 1: PM2 (Linux, recomendado)**
```bash
npm install -g pm2
pm2 start src/index.js --name whatsapp-bot
pm2 save
```

**Opção 2: systemd** — veja o README em inglês.

**Opção 3: Docker**
```bash
docker build -t whatsapp-llm-bot .
docker run -d --name whatsapp-bot --restart unless-stopped whatsapp-llm-bot
```

## Licença

MIT — veja `LICENSE`.

---

> **English?** See [`README.md`](./README.md).
