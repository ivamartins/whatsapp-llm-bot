# WhatsApp + LLM Bot (LLM-agnostic)

Bot that listens to WhatsApp messages and replies using **any OpenAI-compatible chat completions API** — xAI Grok, OpenAI, OpenRouter, Ollama, LM Studio, vLLM, or any custom endpoint.

This is the **LLM-agnostic** version of [whatsapp-grok-bot](https://github.com/ivamartins/whatsapp-grok-bot): no CLI tool, no provider-specific agent files. Just HTTP + a tiny prompt loader. The Grok-CLI version remains as a separate historical example of the `spawn`-based integration.

## Why a separate project?

The previous project (`whatsapp-grok-bot`) tightly couples to the Grok CLI binary (spawns `grok -p "..."` per message and uses Grok-specific `.grok/agents/*.md` + `.grok/skills/*/SKILL.md` files). That works for local dev with the Grok TUI installed, but it's a non-starter for:

- Production / Docker / serverless (no CLI to install).
- Teams that want OpenAI, Anthropic-via-OpenRouter, local Ollama, or a private gateway.
- Anyone who wants the LLM logic in pure HTTP calls they can trace, mock, and test.

This project replaces the CLI with a 100-line OpenAI-compatible HTTP client and the `.grok/` tree with a generic `prompts/` folder. Everything else (Baileys, QR auth, message loop, deploy story) is the same proven shape.

## Architecture

```
whatsapp-llm-bot/
├── index.js                # Boot: Baileys + message handler wiring
├── src/
│   ├── llm-client.js       # Tiny OpenAI-compatible HTTP client (Node fetch)
│   └── prompts.js          # Generic prompt loader with YAML frontmatter
├── prompts/                # LLM-agnostic prompt templates
│   ├── system.md           # System prompt (the "agent")
│   └── skill-reply.md      # Injected as additional system context
├── test/                   # Mocha + chai, 61 tests, no network required
│   ├── llm-client.test.js
│   ├── prompts.test.js
│   └── bot.test.js
├── package.json
├── Dockerfile
└── .env.example
```

**Flow per incoming message:**

1. Baileys emits `messages.upsert`.
2. We extract text, sender, group flag, and the last N messages from an in-memory per-chat store.
3. We build a single chat-completions request: `system` (system.md + skills) + `user` (formatted context + the incoming message).
4. The provider returns a reply. If it is exactly `NO_REPLY`, we skip sending.
5. Otherwise we send it via `sock.sendMessage(...)` and store the exchange in the conversation buffer.

**The LLM client** (`src/llm-client.js`) is dependency-free — it uses Node 18.17+'s built-in `fetch`. It speaks the standard OpenAI Chat Completions schema (`POST {base_url}/chat/completions` with `Authorization: Bearer ...`) and gracefully handles the two most common variants in the `choices[0]` payload (`message.content` for OpenAI/Grok and `text` for some legacy/compatible APIs).

**The prompt loader** (`src/prompts.js`) reads `prompts/*.md` and parses optional YAML frontmatter (`name`, `description`, `model_hint`). It does not know about any specific provider. `prompts/system.md` is the system prompt; any other `*.md` is appended as a "skill" in the same system message. The same prompt set works with any model that accepts a system message.

## Supported providers

Set `LLM_PROVIDER` to one of the built-in presets, or use `custom` and supply your own `LLM_BASE_URL` + `LLM_MODEL`.

| `LLM_PROVIDER` | Base URL                                | Default model          | API key required |
| -------------- | --------------------------------------- | ---------------------- | ---------------- |
| `xai`          | `https://api.x.ai/v1`                   | `grok-3-mini`          | yes              |
| `openai`       | `https://api.openai.com/v1`             | `gpt-4o-mini`          | yes              |
| `openrouter`   | `https://openrouter.ai/api/v1`          | `openai/gpt-4o-mini`   | yes              |
| `ollama`       | `http://localhost:11434/v1`             | `llama3.2`             | no               |
| `lmstudio`     | `http://localhost:1234/v1`             | `local-model`          | no               |
| `custom`       | _set `LLM_BASE_URL` + `LLM_MODEL`_      | _n/a_                  | optional         |

To use a non-default model, set `LLM_MODEL` (and optionally `LLM_BASE_URL`) in `.env`.

## Quick start

### 1. Install

```bash
git clone https://github.com/ivamartins/whatsapp-llm-bot.git
cd whatsapp-llm-bot
npm install
cp .env.example .env
```

### 2. Configure

Edit `.env`. For xAI Grok:

```env
LLM_PROVIDER=xai
LLM_API_KEY=xai-...
LLM_MODEL=grok-3-mini
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=512
CONTEXT_WINDOW=5
```

For local Ollama (no API key needed):

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
# LLM_API_KEY=   leave empty
```

For OpenAI:

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

### 3. Run

```bash
npm start
```

Scan the QR code that appears in the terminal with your WhatsApp app (**Settings → Linked Devices → Link a Device**). The `auth/` folder persists the session — you only need to scan once per device.

You should see:

```
[ws] connected to WhatsApp! Bot is listening for messages...
[llm] provider=xai model=grok-3-mini base=https://api.x.ai/v1
```

### 4. Test

```bash
npm test
```

61 tests, no network, no real WhatsApp. Runs in under 100 ms.

## Customizing the brain (prompts)

The "brain" lives in `prompts/`. Two files ship by default:

- `prompts/system.md` — the system prompt (the agent's role, style, rules).
- `prompts/skill-reply.md` — appended to the system prompt as an additional context block, teaching the model how to craft replies.

To customize:

1. Edit `prompts/system.md` to change tone, language, business rules, or what to do for specific contacts.
2. Add new skills: drop `prompts/my-skill.md` with YAML frontmatter (`name`, `description`, optional `model_hint`) and Markdown body. They are auto-discovered and concatenated into the system message.
3. Add a different model or provider via `LLM_MODEL` / `LLM_PROVIDER`.

No code changes required. The loader picks them up on the next message.

## Running the tests

```bash
npm test
```

- `test/llm-client.test.js` — config resolution (all presets, overrides, missing keys) and the HTTP client (success, 4xx/5xx, non-JSON, timeout, network error, missing key for local providers, request validation).
- `test/prompts.test.js` — frontmatter parsing, error cases, directory loading, real `prompts/` directory.
- `test/bot.test.js` — module shape, conversation store, message extraction, prompt building, `generateReply` (success, NO_REPLY, empty, LLM error, history injection), and the full message handler (send, skip own, skip non-notify, skip empty, NO_REPLY, and resilience to `sendMessage` failures).

The tests do not require a real WhatsApp connection, a real LLM API call, or even internet access. They use a fake `fetch` and in-memory mocks.

## Deploy

### Option 1: PM2 (Linux, recommended)

```bash
npm install -g pm2
cd whatsapp-llm-bot
pm2 start npm --name "whatsapp-llm-bot" -- start
pm2 save
pm2 startup   # follow the printed instructions
pm2 logs whatsapp-llm-bot
```

### Option 2: systemd

Create `/etc/systemd/system/whatsapp-llm-bot.service`:

```ini
[Unit]
Description=WhatsApp LLM Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/whatsapp-llm-bot
ExecStart=/usr/bin/node /home/youruser/whatsapp-llm-bot/index.js
Restart=always
RestartSec=10
EnvironmentFile=/home/youruser/whatsapp-llm-bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-llm-bot
sudo journalctl -u whatsapp-llm-bot -f
```

### Option 3: Docker

```bash
docker build -t whatsapp-llm-bot .
docker run -d --name whatsapp-llm-bot \
  --env-file .env \
  -v $(pwd)/auth:/app/auth \
  --restart unless-stopped \
  whatsapp-llm-bot
```

The `-v` mount is critical so the `auth/` folder (Baileys session) persists across container restarts. Scan the QR the first time by reading the container logs:

```bash
docker logs -f whatsapp-llm-bot
```

## Security & operational notes

- **WhatsApp ToS risk**: automation may violate WhatsApp's terms. Use a secondary number. Baileys is multi-device (less risky than emulators) but still use responsibly.
- **No spam**: keep the bot polite, honor `NO_REPLY` decisions, and consider allowing only specific contacts/groups in production.
- **Secrets**: never commit `.env` or `auth/`. Both are in `.gitignore`.
- **API costs**: hosted LLMs charge per token. Keep `LLM_MAX_TOKENS` reasonable (default 512) and consider rate limiting per contact.
- **PII**: messages are sent to the LLM provider. For sensitive workloads use a local model (Ollama/LM Studio) or a private gateway.

## Extending for legacy systems

This project is part of a portfolio of base frameworks for AI agents that integrate with existing (often legacy) systems via WhatsApp or other channels. See `whatsapp-grok-bot` for the CLI-mode variant and `code-solutions-site` for the broader services context.

To plug in legacy data:

1. Add a skill under `prompts/legacy-query.md` describing the system (e.g. "e-commerce backend in Java/Play").
2. Either let the LLM answer from training/your docs, or extend the prompt to instruct it to call an HTTP endpoint you expose.
3. For richer tool use, add an MCP server (the LLM client just needs the right prompt + a base URL).

## License

MIT — see `LICENSE`.

---

## Resumo em português

Bot de WhatsApp **agnóstico a LLM** que conversa com qualquer API de chat completions compatível com OpenAI (xAI Grok, OpenAI, OpenRouter, Ollama, LM Studio, etc.).

- **Diferencial em relação ao `whatsapp-grok-bot`**: nada de CLI Grok, nada de `.grok/agents` ou `.grok/skills`. Apenas HTTP + uma pasta `prompts/` genérica com frontmatter YAML.
- **61 testes** (Mocha + chai), sem rede, sem WhatsApp real, sem API real. Rodam em < 100 ms.
- **Mesmo deploy** do projeto original: PM2, systemd ou Docker. Sessão Baileys persistida em `auth/`.
- **Como usar**:
  1. `cp .env.example .env` e preencher `LLM_PROVIDER` + `LLM_API_KEY`.
  2. `npm install && npm start`.
  3. Escanear o QR code uma vez.
  4. Mande mensagens — o bot responde usando o `prompts/system.md` configurado.

Mantido como exemplo vivo dos serviços de **agentes de IA** e **modernização de sistemas legados** oferecidos pela Code Solutions. Veja também o site: https://ivamartins.github.io/code-solutions-site/

Boa sorte! Se precisar ajustar prompts, trocar provedor, ou plugar em um sistema legado, é só editar `prompts/` e `.env` — sem mexer no código.
