'use strict';

const assert = require('assert');
const path = require('path');
const {
  ConversationStore,
  extractMessageText,
  isGroupJid,
  buildSystemPrompt,
  buildUserMessage,
  generateReply,
  createMessageHandler,
} = require('../index.js');
const { loadBotPrompts } = require('../src/prompts');

describe('whatsapp-llm-bot (module shape)', function () {
  it('loads index.js without auto-starting the bot', function () {
    const mod = require('../index.js');
    assert.strictEqual(typeof mod.startBot, 'function');
    assert.strictEqual(typeof mod.generateReply, 'function');
    assert.strictEqual(typeof mod.createMessageHandler, 'function');
  });

  it('has the expected project layout', function () {
    const fs = require('fs');
    const root = path.resolve(__dirname, '..');
    assert.ok(fs.existsSync(path.join(root, 'index.js')));
    assert.ok(fs.existsSync(path.join(root, 'package.json')));
    assert.ok(fs.existsSync(path.join(root, 'prompts', 'system.md')));
    assert.ok(fs.existsSync(path.join(root, 'prompts', 'skill-reply.md')));
    assert.ok(fs.existsSync(path.join(root, 'skills', 'INDEX.md')));
    assert.ok(fs.existsSync(path.join(root, 'spec', 'INDEX.md')));
    assert.ok(fs.existsSync(path.join(root, 'mcp', 'INDEX.md')));
    assert.ok(fs.existsSync(path.join(root, 'tools', 'INDEX.md')));
  });
});

describe('ConversationStore', function () {
  it('keeps only the last N messages per jid', function () {
    const s = new ConversationStore(3);
    s.add('a', 'user', 'u1');
    s.add('a', 'assistant', 'a1');
    s.add('a', 'user', 'u2');
    s.add('a', 'assistant', 'a2');
    s.add('a', 'user', 'u3');
    assert.deepStrictEqual(
      s.get('a').map((m) => m.content),
      ['u2', 'a2', 'u3']
    );
  });

  it('isolates jids', function () {
    const s = new ConversationStore(5);
    s.add('a', 'user', 'x');
    s.add('b', 'user', 'y');
    assert.deepStrictEqual(s.get('a'), [{ role: 'user', content: 'x' }]);
    assert.deepStrictEqual(s.get('b'), [{ role: 'user', content: 'y' }]);
  });

  it('clears a single jid or all', function () {
    const s = new ConversationStore(5);
    s.add('a', 'user', 'x');
    s.add('b', 'user', 'y');
    s.clear('a');
    assert.deepStrictEqual(s.get('a'), []);
    assert.strictEqual(s.get('b').length, 1);
    s.clear();
    assert.deepStrictEqual(s.get('b'), []);
  });
});

describe('extractMessageText', function () {
  it('reads plain conversation', function () {
    assert.strictEqual(extractMessageText({ message: { conversation: 'oi' } }), 'oi');
  });

  it('reads extendedTextMessage.text', function () {
    assert.strictEqual(
      extractMessageText({ message: { extendedTextMessage: { text: 'oi' } } }),
      'oi'
    );
  });

  it('reads image/video/document captions', function () {
    assert.strictEqual(
      extractMessageText({ message: { imageMessage: { caption: 'look' } } }),
      'look'
    );
    assert.strictEqual(
      extractMessageText({ message: { videoMessage: { caption: 'watch' } } }),
      'watch'
    );
    assert.strictEqual(
      extractMessageText({ message: { documentMessage: { caption: 'read' } } }),
      'read'
    );
  });

  it('returns empty string for missing/empty messages', function () {
    assert.strictEqual(extractMessageText({}), '');
    assert.strictEqual(extractMessageText({ message: {} }), '');
    assert.strictEqual(extractMessageText(null), '');
  });
});

describe('isGroupJid', function () {
  it('detects group jids', function () {
    assert.strictEqual(isGroupJid('123@g.us'), true);
  });
  it('detects non-group jids', function () {
    assert.strictEqual(isGroupJid('5511@s.whatsapp.net'), false);
    assert.strictEqual(isGroupJid(null), false);
  });
});

describe('buildSystemPrompt', function () {
  it('appends skills to the system body', function () {
    const bundle = {
      system: { body: 'BASE' },
      skills: [
        { name: 's1', body: 'SKILL ONE' },
        { name: 's2', body: 'SKILL TWO' },
      ],
    };
    const out = buildSystemPrompt(bundle);
    assert.match(out, /^BASE/);
    assert.match(out, /# Skill: s1/);
    assert.match(out, /SKILL ONE/);
    assert.match(out, /# Skill: s2/);
    assert.match(out, /SKILL TWO/);
  });

  it('returns just the system body when no skills', function () {
    const out = buildSystemPrompt({ system: { body: 'ONLY' }, skills: [] });
    assert.strictEqual(out, 'ONLY');
  });
});

describe('buildUserMessage', function () {
  it('formats sender, group flag, history, and message', function () {
    const msg = buildUserMessage({
      fromName: 'João',
      text: 'oi',
      isGroup: true,
      history: [
        { role: 'user', content: 'e aí' },
        { role: 'assistant', content: 'tudo bem?' },
      ],
    });
    assert.match(msg, /From: João/);
    assert.match(msg, /Is group: yes/);
    assert.match(msg, /Recent context:/);
    assert.match(msg, /João: e aí/);
    assert.match(msg, /Bot: tudo bem\?/);
    assert.match(msg, /Message: oi/);
    assert.match(msg, /NO_REPLY/);
  });

  it('omits the Recent context block when history is empty', function () {
    const msg = buildUserMessage({ fromName: 'A', text: 'x', isGroup: false });
    assert.doesNotMatch(msg, /Recent context:/);
    assert.match(msg, /From: A/);
    assert.match(msg, /Is group: no/);
  });
});

describe('generateReply', function () {
  const root = path.resolve(__dirname, '..');
  const bundle = loadBotPrompts(root);

  function fakeClient(replyContent, throwErr) {
    return {
      chat: async () => {
        if (throwErr) throw throwErr;
        return { content: replyContent, model: 'test-model' };
      },
    };
  }

  it('returns NO_REPLY_TOKEN for empty text', async function () {
    const r = await generateReply(fakeClient('hi'), bundle, { text: '' });
    assert.strictEqual(r.reply, 'NO_REPLY');
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, 'empty_message');
  });

  it('returns NO_REPLY_TOKEN when LLM emits NO_REPLY', async function () {
    const r = await generateReply(fakeClient('NO_REPLY'), bundle, {
      text: 'ok',
      fromName: 'Bob',
    });
    assert.strictEqual(r.reply, 'NO_REPLY');
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, 'llm_no_reply');
  });

  it('returns NO_REPLY_TOKEN when LLM emits empty content', async function () {
    const r = await generateReply(fakeClient('   '), bundle, { text: 'oi' });
    assert.strictEqual(r.reply, 'NO_REPLY');
    assert.strictEqual(r.reason, 'llm_no_reply');
  });

  it('returns the trimmed LLM reply when valid', async function () {
    const r = await generateReply(fakeClient('  E aí, tudo bem?  '), bundle, {
      text: 'eai',
      fromName: 'Ana',
    });
    assert.strictEqual(r.reply, 'E aí, tudo bem?');
    assert.strictEqual(r.sent, true);
  });

  it('catches LLM errors and returns NO_REPLY_TOKEN with reason=llm_error', async function () {
    const r = await generateReply(fakeClient(null, new Error('boom')), bundle, {
      text: 'oi',
    });
    assert.strictEqual(r.reply, 'NO_REPLY');
    assert.strictEqual(r.sent, false);
    assert.strictEqual(r.reason, 'llm_error');
    assert.strictEqual(r.error.message, 'boom');
  });

  it('sends the LLM a well-formed system + user message', async function () {
    let captured;
    const client = {
      chat: async (messages) => {
        captured = messages;
        return { content: 'pong', model: 'm' };
      },
    };
    await generateReply(client, bundle, {
      fromName: 'Caio',
      text: 'ping',
      isGroup: false,
    });
    assert.strictEqual(captured.length, 2);
    assert.strictEqual(captured[0].role, 'system');
    assert.match(captured[0].content, /WhatsApp chat assistant/);
    assert.strictEqual(captured[1].role, 'user');
    assert.match(captured[1].content, /From: Caio/);
    assert.match(captured[1].content, /Message: ping/);
  });

  it('auto-discovers skills from both skills/ (Anthropic) and prompts/ (flat)', function () {
    const names = bundle.skills.map((s) => s.name);
    assert.ok(
      names.includes('whatsapp-reply'),
      `expected whatsapp-reply in skills, got ${names.join(', ')}`
    );
    assert.ok(
      names.includes('summarizer'),
      `expected summarizer (from skills/) in skills, got ${names.join(', ')}`
    );
    assert.ok(
      names.includes('translator'),
      `expected translator (from skills/) in skills, got ${names.join(', ')}`
    );
    assert.ok(
      names.includes('scheduler'),
      `expected scheduler (from skills/) in skills, got ${names.join(', ')}`
    );
    assert.ok(
      names.includes('legacy-query'),
      `expected legacy-query (from skills/) in skills, got ${names.join(', ')}`
    );
  });

  it('reports the layout it used in meta.sources', function () {
    assert.strictEqual(bundle.meta.sources.layout, 'anthropic');
    assert.ok(bundle.meta.sources.skills);
    assert.ok(bundle.meta.sources.prompts);
  });

  it('uses store history when caller does not pass history', async function () {
    const store = new ConversationStore(5);
    store.add('chat1', 'user', 'oi');
    store.add('chat1', 'assistant', 'olá');

    let captured;
    const client = {
      chat: async (messages) => {
        captured = messages;
        return { content: '!', model: 'm' };
      },
    };
    await generateReply(
      client,
      bundle,
      { jid: 'chat1', text: 'tudo bem?', fromName: 'Cris' },
      store
    );
    const userMsg = captured[1].content;
    assert.match(userMsg, /Recent context:/);
    assert.match(userMsg, /Cris: oi/);
    assert.match(userMsg, /Bot: olá/);
    assert.match(userMsg, /Message: tudo bem\?/);
  });
});

describe('createMessageHandler', function () {
  const root = path.resolve(__dirname, '..');
  const bundle = loadBotPrompts(root);

  it('sends a reply when the LLM returns a valid suggestion', async function () {
    const sent = [];
    const store = new ConversationStore(5);
    const sock = { sendMessage: async (jid, msg) => sent.push({ jid, msg }) };
    const client = { chat: async () => ({ content: 'Olá!', model: 'm' }) };
    const logs = [];
    const handler = createMessageHandler({
      client,
      promptsBundle: bundle,
      store,
      sock,
      logger: { log: (s) => logs.push(s) },
    });

    await handler({
      type: 'notify',
      messages: [
        {
          key: { fromMe: false, remoteJid: '5511@s.whatsapp.net' },
          message: { conversation: 'oi' },
          pushName: 'Ana',
        },
      ],
    });

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].jid, '5511@s.whatsapp.net');
    assert.strictEqual(sent[0].msg.text, 'Olá!');
    assert.deepStrictEqual(
      store.get('5511@s.whatsapp.net').map((m) => m.content),
      ['oi', 'Olá!']
    );
  });

  it('skips messages from ourselves', async function () {
    const sent = [];
    const sock = { sendMessage: async (j, m) => sent.push({ j, m }) };
    const client = { chat: async () => ({ content: 'should not be called', model: 'm' }) };
    let called = false;
    const wrappedClient = { chat: async (...a) => { called = true; return client.chat(...a); } };
    const handler = createMessageHandler({
      client: wrappedClient,
      promptsBundle: bundle,
      store: new ConversationStore(5),
      sock,
      logger: console,
    });

    await handler({
      type: 'notify',
      messages: [
        {
          key: { fromMe: true, remoteJid: '5511@s.whatsapp.net' },
          message: { conversation: 'echo' },
        },
      ],
    });
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(called, false);
  });

  it('skips non-notify events', async function () {
    const sent = [];
    const sock = { sendMessage: async (j, m) => sent.push({ j, m }) };
    const client = { chat: async () => ({ content: 'x', model: 'm' }) };
    const handler = createMessageHandler({
      client,
      promptsBundle: bundle,
      store: new ConversationStore(5),
      sock,
      logger: console,
    });

    await handler({ type: 'append', messages: [] });
    assert.strictEqual(sent.length, 0);
  });

  it('skips messages with no extractable text', async function () {
    const sent = [];
    const sock = { sendMessage: async (j, m) => sent.push({ j, m }) };
    let called = false;
    const client = { chat: async () => { called = true; return { content: 'x', model: 'm' }; } };
    const handler = createMessageHandler({
      client,
      promptsBundle: bundle,
      store: new ConversationStore(5),
      sock,
      logger: console,
    });

    await handler({
      type: 'notify',
      messages: [{ key: { fromMe: false, remoteJid: 'x' }, message: {} }],
    });
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(called, false);
  });

  it('does not send anything when the LLM returns NO_REPLY', async function () {
    const sent = [];
    const sock = { sendMessage: async (j, m) => sent.push({ j, m }) };
    const client = { chat: async () => ({ content: 'NO_REPLY', model: 'm' }) };
    const handler = createMessageHandler({
      client,
      promptsBundle: bundle,
      store: new ConversationStore(5),
      sock,
      logger: console,
    });

    await handler({
      type: 'notify',
      messages: [
        {
          key: { fromMe: false, remoteJid: 'g@g.us' },
          message: { conversation: 'kkk' },
          pushName: 'B',
        },
      ],
    });
    assert.strictEqual(sent.length, 0);
  });

  it('keeps going when sendMessage throws', async function () {
    const store = new ConversationStore(5);
    const sock = { sendMessage: async () => { throw new Error('network down'); } };
    const client = { chat: async () => ({ content: 'reply', model: 'm' }) };
    const errs = [];
    const handler = createMessageHandler({
      client,
      promptsBundle: bundle,
      store,
      sock,
      logger: { log() {}, error: (...args) => errs.push(args.join(' ')) },
    });

    await handler({
      type: 'notify',
      messages: [
        {
          key: { fromMe: false, remoteJid: 'a@s.whatsapp.net' },
          message: { conversation: 'oi' },
        },
      ],
    });
    assert.strictEqual(errs.length, 1);
    assert.match(errs[0], /network down/);
  });
});
