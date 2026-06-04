'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/**
 * Loads prompt templates from a directory.
 * Each .md file may have YAML frontmatter delimited by "---" lines.
 * Returns: { name, description, model_hint, body, raw, source }
 *
 * The loader is LLM-agnostic: it does not know or care which provider uses
 * the prompt. It just exposes structured metadata + body.
 */
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf('\n---', 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const fmBlock = raw.slice(3, end).replace(/^\n/, '');
  const body = raw.slice(end + 4).replace(/^\n/, '');
  let meta = {};
  try {
    meta = YAML.parse(fmBlock) || {};
  } catch (err) {
    throw new Error(`Invalid YAML frontmatter: ${err.message}`);
  }
  return { meta, body };
}

function loadPromptFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  return {
    name: meta.name || path.basename(filePath, path.extname(filePath)),
    description: (meta.description || '').trim(),
    model_hint: meta.model_hint || null,
    body: body.trim(),
    raw,
    source: filePath,
  };
}

function loadPromptsDir(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Prompts directory not found: ${dir}`);
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const prompts = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const full = path.join(dir, entry.name);
    const prompt = loadPromptFile(full);
    prompt.filename = entry.name;
    prompts[prompt.name] = prompt;
    if (entry.name !== prompt.name) {
      prompts[path.basename(entry.name, '.md')] = prompt;
    }
  }
  return prompts;
}

/**
 * Loads the primary system prompt and concatenates all skill prompts.
 * Returns: { system, skills: [{name, body}], meta }
 */
function loadBotPrompts(rootDir) {
  const promptsDir = path.join(rootDir, 'prompts');
  const all = loadPromptsDir(promptsDir);

  const systemCandidates = ['system', 'agent', 'assistant']
    .map((n) => all[n])
    .filter(Boolean);

  if (systemCandidates.length === 0) {
    throw new Error(
      `No system prompt found in ${promptsDir}. Expected prompts/system.md.`
    );
  }
  const system = systemCandidates[0];

  const skills = Object.values(all).filter((p) => p.name !== system.name);

  return { system, skills, meta: { promptsDir, count: Object.keys(all).length } };
}

module.exports = {
  parseFrontmatter,
  loadPromptFile,
  loadPromptsDir,
  loadBotPrompts,
};
