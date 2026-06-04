'use strict';

const path = require('path');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const { LlmClient } = require('./src/llm-client');
const { loadBotPrompts } = require('./src/prompts');

// ===== Config =====
const BOT_DIR = __dirname;
const PROMPTS_DIR = path.join(BOT_DIR, 'prompts');
const AUTH_FOLDER = process.env.AUTH_FOLDER || path.join(BOT_DIR, 'auth');
const CONTEXT_WINDOW = Math.max(0, parseInt(process.env.CONTEXT_WINDOW || '5', 10));
const NO_REPLY_TOKEN = 'NO_REPLY';

// ===== In-memory conversation store (per chat jid, last N messages) =====
class ConversationStore {
  constructor(window = 5) {
    this.window = window;
    this.map = new Map();
  }

  add(jid, role, content) {
    if (!this.map.has(jid)) this.map.set(jid, []);
    const arr = this.map.get(jid);
    arr.push({ role, content });
    while (arr.length > this.window) arr.shift();
  }

  get(jid) {
    return this.map.get(jid) || [];
  }

  clear(jid) {
    if (jid) this.map.delete(jid);
    else this.map.clear();
  }
}

// ===== Prompt building (pure, testable) =====
function buildSystemPrompt(promptsBundle) {
  const { system, skills } = promptsBundle;
  let sys = system.body;
  if (skills.length > 0) {
    const skillsText = skills
      .map((s) => `\n\n# Skill: ${s.name}\n${s.body}`)
      .join('');
    sys = sys + skillsText;
  }
  return sys;
}

function buildUserMessage({ fromName, text, isGroup, history }) {
  const lines = [];
  if (fromName) lines.push(`From: ${fromName}`);
  lines.push(`Is group: ${isGroup ? 'yes' : 'no'}`);
  if (history && history.length > 0) {
    lines.push('Recent context:');
    for (const h of history) {
      const who = h.role === 'assistant' ? 'Bot' : h.role === 'user' ? fromName || 'User' : 'System';
      lines.push(`  ${who}: ${h.content}`);
    }
  }
  lines.push('');
  lines.push(`Message: ${text}`);
  lines.push('');
  lines.push(
    'Reply with the suggested WhatsApp message only, or exactly NO_REPLY if no reply is appropriate.'
  );
  return lines.join('\n');
}

/**
 * Core: ask the LLM for a reply.
 * Exported for tests. Does not touch WhatsApp.
 *
 * @param {LlmClient} client
 * @param {{system: string, skills: Array}} promptsBundle
 * @param {{fromName?: string, text: string, isGroup?: boolean, history?: Array}} input
 * @param {ConversationStore} [store]
 */
async function generateReply(client, promptsBundle, input, store) {
  const { fromName, text, isGroup = false, history = [] } = input || {};
  if (!text || typeof text !== 'string') {
    return { reply: NO_REPLY_TOKEN, sent: false, reason: 'empty_message' };
  }

  const systemPrompt = buildSystemPrompt(promptsBundle);
  const context = history.length > 0 ? history : store ? store.get(input.jid) : [];
  const userMessage = buildUserMessage({ fromName, text, isGroup, history: context });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let result;
  try {
    result = await client.chat(messages);
  } catch (err) {
    return { reply: NO_REPLY_TOKEN, sent: false, reason: 'llm_error', error: err };
  }

  const reply = (result.content || '').trim();
  if (!reply || reply === NO_REPLY_TOKEN) {
    return { reply: NO_REPLY_TOKEN, sent: false, reason: 'llm_no_reply' };
  }
  return { reply, sent: true, model: result.model };
}

// ===== Message extraction =====
function extractMessageText(msg) {
  if (!msg || !msg.message) return '';
  return (
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.caption ||
    ''
  );
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

// ===== Bot factory (testable) =====
/**
 * Create the WhatsApp message handler bound to a specific LLM client and
 * prompts bundle. Returns a function you can plug into sock.ev.on('messages.upsert', ...).
 *
 *   const handler = createMessageHandler({ client, promptsBundle, store, sock, logger });
 *   sock.ev.on('messages.upsert', handler);
 */
function createMessageHandler({ client, promptsBundle, store, sock, logger = console }) {
  return async function onMessagesUpsert({ messages, type }) {
    if (type !== 'notify' || !Array.isArray(messages)) return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const from = msg.key.remoteJid;
        const isGroup = isGroupJid(from);
        const text = extractMessageText(msg);
        if (!text) continue;

        const fromName =
          msg.pushName || msg.key.participant || (from ? from.split('@')[0] : 'unknown');

        logger.log?.(`\n[msg] ${fromName} (${from}): "${text}"`);

        const history = store.get(from);
        const { reply, sent, reason, error } = await generateReply(
          client,
          promptsBundle,
          { fromName, text, isGroup, history, jid: from },
          store
        );

        if (!sent) {
          logger.log?.(`[skip] reason=${reason}${error ? ' err=' + error.message : ''}`);
          continue;
        }

        logger.log?.(`[reply] → "${reply}"`);
        await sock.sendMessage(from, { text: reply });
        store.add(from, 'user', text);
        store.add(from, 'assistant', reply);
      } catch (err) {
        logger.error?.('[handler] error:', err);
      }
    }
  };
}

// ===== Boot =====
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  const client = LlmClient.fromEnv();
  const promptsBundle = loadBotPrompts(BOT_DIR);
  const store = new ConversationStore(CONTEXT_WINDOW);
  const handler = createMessageHandler({
    client,
    promptsBundle,
    store,
    sock,
    logger: console,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n=== Scan the QR Code with your WhatsApp ===\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[ws] connection closed. Reconnect?', shouldReconnect);
      if (shouldReconnect) {
        startBot().catch(console.error);
      } else {
        console.log('[ws] logged out. Delete the auth/ folder and restart to scan a new QR.');
      }
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp! Bot is listening for messages...');
      console.log(
        `[llm] provider=${client.config.provider} model=${client.config.model} base=${client.config.baseUrl}`
      );
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', handler);

  return sock;
}

// ===== Entry =====
if (require.main === module) {
  console.log('Starting WhatsApp + LLM bot...');
  startBot().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  startBot,
  generateReply,
  createMessageHandler,
  buildSystemPrompt,
  buildUserMessage,
  ConversationStore,
  extractMessageText,
  isGroupJid,
};
