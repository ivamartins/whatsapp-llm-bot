'use strict';

const assert = require('assert');
const path = require('path');
const { LlmClient, resolveConfig, PROVIDER_PRESETS } = require('../src/llm-client');

/** Build a fake fetch that returns a canned response. */
function makeFakeFetch(responder) {
  return async (url, opts) => responder(url, opts);
}

describe('resolveConfig', function () {
  it('resolves xai preset with default model and base url', function () {
    const cfg = resolveConfig({ LLM_PROVIDER: 'xai', LLM_API_KEY: 'sk-test' });
    assert.strictEqual(cfg.provider, 'xai');
    assert.strictEqual(cfg.baseUrl, 'https://api.x.ai/v1');
    assert.strictEqual(cfg.model, 'grok-3-mini');
    assert.strictEqual(cfg.apiKey, 'sk-test');
    assert.strictEqual(cfg.requiresKey, true);
  });

  it('respects LLM_BASE_URL and LLM_MODEL overrides', function () {
    const cfg = resolveConfig({
      LLM_PROVIDER: 'xai',
      LLM_API_KEY: 'sk-test',
      LLM_BASE_URL: 'https://proxy.example.com/v1/',
      LLM_MODEL: 'grok-3',
    });
    assert.strictEqual(cfg.baseUrl, 'https://proxy.example.com/v1'); // trailing slash stripped
    assert.strictEqual(cfg.model, 'grok-3');
  });

  it('does not require an API key for ollama preset', function () {
    const cfg = resolveConfig({ LLM_PROVIDER: 'ollama' });
    assert.strictEqual(cfg.provider, 'ollama');
    assert.strictEqual(cfg.baseUrl, 'http://localhost:11434/v1');
    assert.strictEqual(cfg.model, 'llama3.2');
    assert.strictEqual(cfg.apiKey, '');
  });

  it('throws if xai is missing an API key', function () {
    assert.throws(
      () => resolveConfig({ LLM_PROVIDER: 'xai' }),
      /requires LLM_API_KEY/
    );
  });

  it('supports custom provider with explicit base_url and model', function () {
    const cfg = resolveConfig({
      LLM_PROVIDER: 'custom',
      LLM_BASE_URL: 'http://localhost:9999/v1',
      LLM_MODEL: 'my-model',
    });
    assert.strictEqual(cfg.provider, 'custom');
    assert.strictEqual(cfg.baseUrl, 'http://localhost:9999/v1');
    assert.strictEqual(cfg.model, 'my-model');
  });

  it('throws if custom provider is missing LLM_BASE_URL', function () {
    assert.throws(
      () => resolveConfig({ LLM_PROVIDER: 'custom', LLM_MODEL: 'm' }),
      /requires LLM_BASE_URL/
    );
  });

  it('throws on unknown provider', function () {
    assert.throws(
      () => resolveConfig({ LLM_PROVIDER: 'grok360' }),
      /Unknown LLM_PROVIDER/
    );
  });

  it('parses numeric env vars with sane defaults', function () {
    const cfg = resolveConfig({
      LLM_PROVIDER: 'ollama',
      LLM_TEMPERATURE: '0.2',
      LLM_MAX_TOKENS: '256',
      LLM_TIMEOUT_MS: '5000',
    });
    assert.strictEqual(cfg.temperature, 0.2);
    assert.strictEqual(cfg.maxTokens, 256);
    assert.strictEqual(cfg.timeoutMs, 5000);
  });

  it('falls back to defaults when numeric env vars are missing or invalid', function () {
    const cfg = resolveConfig({ LLM_PROVIDER: 'ollama' });
    assert.strictEqual(cfg.temperature, 0.7);
    assert.strictEqual(cfg.maxTokens, 512);
    assert.strictEqual(cfg.timeoutMs, 30000);
  });

  it('exposes the preset catalog', function () {
    assert.ok(PROVIDER_PRESETS.xai);
    assert.ok(PROVIDER_PRESETS.openai);
    assert.ok(PROVIDER_PRESETS.ollama);
    assert.ok(PROVIDER_PRESETS.lmstudio);
    assert.ok(PROVIDER_PRESETS.openrouter);
  });
});

describe('LlmClient.chat', function () {
  const baseConfig = {
    provider: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3-mini',
    apiKey: 'sk-test',
    temperature: 0.5,
    maxTokens: 128,
    timeoutMs: 1000,
  };

  it('posts to {baseUrl}/chat/completions with bearer auth', async function () {
    let captured;
    const fakeFetch = makeFakeFetch(async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'x',
            model: 'grok-3-mini',
            choices: [{ message: { role: 'assistant', content: 'oi!' } }],
          }),
      };
    });

    const client = new LlmClient(baseConfig, fakeFetch);
    const result = await client.chat([{ role: 'user', content: 'hi' }]);

    assert.strictEqual(result.content, 'oi!');
    assert.strictEqual(result.model, 'grok-3-mini');
    assert.strictEqual(captured.url, 'https://api.x.ai/v1/chat/completions');
    assert.strictEqual(captured.opts.method, 'POST');
    assert.strictEqual(captured.opts.headers.Authorization, 'Bearer sk-test');
    assert.strictEqual(captured.opts.headers['Content-Type'], 'application/json');

    const body = JSON.parse(captured.opts.body);
    assert.strictEqual(body.model, 'grok-3-mini');
    assert.strictEqual(body.stream, false);
    assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hi' }]);
    assert.strictEqual(body.temperature, 0.5);
    assert.strictEqual(body.max_tokens, 128);
  });

  it('extracts content from choices[0].message.content', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: 'hello' } }] }),
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    const r = await client.chat([{ role: 'user', content: 'x' }]);
    assert.strictEqual(r.content, 'hello');
  });

  it('falls back to choices[0].text for older APIs', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ text: 'legacy' }] }),
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    const r = await client.chat([{ role: 'user', content: 'x' }]);
    assert.strictEqual(r.content, 'legacy');
  });

  it('throws a structured error on HTTP 4xx/5xx with provider context', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'bad key' } }),
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    await assert.rejects(
      client.chat([{ role: 'user', content: 'x' }]),
      (err) => {
        assert.strictEqual(err.status, 401);
        assert.match(err.message, /401/);
        assert.match(err.message, /bad key/);
        return true;
      }
    );
  });

  it('handles non-JSON error bodies gracefully', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: false,
      status: 502,
      text: async () => '<html>bad gateway</html>',
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    await assert.rejects(
      client.chat([{ role: 'user', content: 'x' }]),
      /LLM error \(502\)/
    );
  });

  it('handles non-JSON success bodies gracefully', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    await assert.rejects(
      client.chat([{ role: 'user', content: 'x' }]),
      /non-JSON/
    );
  });

  it('translates AbortError into ETIMEDOUT', async function () {
    const fakeFetch = makeFakeFetch(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const client = new LlmClient(baseConfig, fakeFetch);
    await assert.rejects(
      client.chat([{ role: 'user', content: 'x' }]),
      (err) => {
        assert.strictEqual(err.code, 'ETIMEDOUT');
        assert.match(err.message, /timed out/);
        return true;
      }
    );
  });

  it('wraps network errors with provider context', async function () {
    const fakeFetch = makeFakeFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const client = new LlmClient(baseConfig, fakeFetch);
    await assert.rejects(
      client.chat([{ role: 'user', content: 'x' }]),
      /ECONNREFUSED/
    );
  });

  it('omits Authorization header when no API key is set (local providers)', async function () {
    let captured;
    const fakeFetch = makeFakeFetch(async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      };
    });
    const localCfg = { ...baseConfig, apiKey: '', baseUrl: 'http://localhost:11434/v1', provider: 'ollama' };
    const client = new LlmClient(localCfg, fakeFetch);
    await client.chat([{ role: 'user', content: 'x' }]);
    assert.strictEqual(captured.opts.headers.Authorization, undefined);
  });

  it('validates messages array', async function () {
    const client = new LlmClient(baseConfig, makeFakeFetch(async () => ({})));
    await assert.rejects(client.chat([]), /non-empty/);
    await assert.rejects(client.chat('not-array'), /non-empty/);
    await assert.rejects(
      client.chat([{ role: 'user' }]),
      /role.*content/
    );
  });

  it('requires baseUrl in config', function () {
    assert.throws(() => new LlmClient({}), /baseUrl/);
  });

  it('serializes empty assistant content as empty string', async function () {
    const fakeFetch = makeFakeFetch(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '' } }] }),
    }));
    const client = new LlmClient(baseConfig, fakeFetch);
    const r = await client.chat([{ role: 'user', content: 'x' }]);
    assert.strictEqual(r.content, '');
  });
});
