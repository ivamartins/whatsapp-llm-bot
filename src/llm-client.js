'use strict';

/**
 * LLM-agnostic client for OpenAI-compatible chat completions APIs.
 *
 * Works with any provider that implements POST {base_url}/chat/completions
 * with a body of { model, messages: [{role, content}, ...] } and an
 * Authorization: Bearer header.
 *
 * Built-in presets:
 *   - xai:        xAI Grok (https://api.x.ai/v1)
 *   - openai:     OpenAI (https://api.openai.com/v1)
 *   - openrouter: OpenRouter (https://openrouter.ai/api/v1)
 *   - ollama:     Ollama local (http://localhost:11434/v1)
 *   - lmstudio:   LM Studio local (http://localhost:1234/v1)
 *   - custom:     set LLM_BASE_URL + LLM_MODEL yourself
 *
 * The client is intentionally tiny and dependency-free (uses Node's built-in
 * fetch, available in Node 18.17+).
 */

const PROVIDER_PRESETS = {
  xai: {
    base_url: 'https://api.x.ai/v1',
    default_model: 'grok-3-mini',
    requires_api_key: true,
  },
  openai: {
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini',
    requires_api_key: true,
  },
  openrouter: {
    base_url: 'https://openrouter.ai/api/v1',
    default_model: 'openai/gpt-4o-mini',
    requires_api_key: true,
  },
  ollama: {
    base_url: 'http://localhost:11434/v1',
    default_model: 'llama3.2',
    requires_api_key: false,
  },
  lmstudio: {
    base_url: 'http://localhost:1234/v1',
    default_model: 'local-model',
    requires_api_key: false,
  },
};

function resolveConfig(env) {
  const provider = (env.LLM_PROVIDER || 'xai').toLowerCase();
  const preset = PROVIDER_PRESETS[provider];

  let baseUrl = env.LLM_BASE_URL;
  let model = env.LLM_MODEL;
  let requiresKey = true;

  if (provider === 'custom') {
    if (!baseUrl) {
      throw new Error(
        'LLM_PROVIDER=custom requires LLM_BASE_URL to be set (e.g. http://localhost:8000/v1).'
      );
    }
    if (!model) {
      throw new Error('LLM_PROVIDER=custom requires LLM_MODEL to be set.');
    }
    requiresKey = false;
  } else if (!preset) {
    const known = Object.keys(PROVIDER_PRESETS).join(', ');
    throw new Error(
      `Unknown LLM_PROVIDER='${provider}'. Known presets: ${known}, custom.`
    );
  } else {
    baseUrl = baseUrl || preset.base_url;
    model = model || preset.default_model;
    requiresKey = preset.requires_api_key;
  }

  const apiKey = env.LLM_API_KEY || '';
  if (requiresKey && !apiKey) {
    throw new Error(
      `LLM_PROVIDER='${provider}' requires LLM_API_KEY. Set it in your .env or environment.`
    );
  }

  return {
    provider,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    apiKey,
    requiresKey,
    temperature: Number.isFinite(+env.LLM_TEMPERATURE) ? +env.LLM_TEMPERATURE : 0.7,
    maxTokens: Number.isFinite(+env.LLM_MAX_TOKENS) ? +env.LLM_MAX_TOKENS : 512,
    timeoutMs: Number.isFinite(+env.LLM_TIMEOUT_MS) ? +env.LLM_TIMEOUT_MS : 30000,
  };
}

class LlmClient {
  constructor(config, fetchImpl) {
    if (!config || !config.baseUrl) {
      throw new Error('LlmClient requires config.baseUrl');
    }
    this.config = config;
    this._fetch = fetchImpl || globalThis.fetch;
    if (typeof this._fetch !== 'function') {
      throw new Error(
        'No fetch implementation available. Node 18.17+ has global fetch; on older runtimes pass fetchImpl.'
      );
    }
  }

  static fromEnv(env = process.env, fetchImpl) {
    return new LlmClient(resolveConfig(env), fetchImpl);
  }

  /**
   * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
   * @param {object} [opts]
   * @returns {Promise<{content: string, raw: object, model: string}>}
   */
  async chat(messages, opts = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('chat() requires a non-empty messages array');
    }
    for (const m of messages) {
      if (!m || !m.role || typeof m.content !== 'string') {
        throw new Error('Each message must have {role, content: string}');
      }
    }

    const body = {
      model: this.config.model,
      messages,
      temperature: opts.temperature ?? this.config.temperature,
      max_tokens: opts.maxTokens ?? this.config.maxTokens,
      stream: false,
    };

    const url = `${this.config.baseUrl}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let res;
    try {
      res = await this._fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        const e = new Error(
          `LLM request timed out after ${this.config.timeoutMs}ms (${this.config.provider} @ ${this.config.baseUrl})`
        );
        e.code = 'ETIMEDOUT';
        throw e;
      }
      const e = new Error(
        `LLM request failed (${this.config.provider} @ ${this.config.baseUrl}): ${err.message}`
      );
      e.cause = err;
      throw e;
    }
    clearTimeout(timer);

    const text = await res.text();
    let payload = null;
    let parseErr = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        parseErr = err;
      }
    }

    if (!res.ok) {
      const msg =
        (payload && (payload.error?.message || payload.message)) ||
        text ||
        `HTTP ${res.status}`;
      const e = new Error(`LLM error (${res.status}): ${msg}`);
      e.status = res.status;
      e.payload = payload;
      throw e;
    }

    if (parseErr) {
      const e = new Error(
        `LLM returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
      );
      e.status = res.status;
      e.cause = parseErr;
      throw e;
    }

    const choice = payload.choices && payload.choices[0];
    const content =
      choice?.message?.content ??
      choice?.text ??
      choice?.delta?.content ??
      '';

    return {
      content: typeof content === 'string' ? content : JSON.stringify(content),
      raw: payload,
      model: payload.model || this.config.model,
    };
  }
}

module.exports = { LlmClient, resolveConfig, PROVIDER_PRESETS };
