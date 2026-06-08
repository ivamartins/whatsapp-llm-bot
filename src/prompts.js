'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/**
 * Prompt + skill loader.
 *
 * The bot can be configured with prompt assets from two layouts, both
 * following widely-used conventions:
 *
 *   1. **Flat prompts/** (legacy / simple):  `prompts/<name>.md`
 *      A single `system.md` is the system prompt; every other `*.md` is
 *      a "skill" appended to the system message. YAML frontmatter is
 *      parsed for metadata.
 *
 *   2. **Anthropic-style skills/** (preferred): `skills/<skill-name>/SKILL.md`
 *      Each skill is its own folder containing a `SKILL.md` with YAML
 *      frontmatter (`name`, `description`, `version`, `tags`, `triggers`,
 *      `allowed_tools`, `references`). The system prompt may live either
 *      inside `skills/<system>/SKILL.md` or in the legacy `prompts/system.md`
 *      for back-compat.
 *
 * The loader inspects `rootDir` and picks the richest layout available.
 * Both layouts can coexist: when both `skills/` and `prompts/` are present,
 * `skills/` wins for the skill list, and `prompts/system.md` still wins
 * for the system prompt (so existing deployments don't need a rename).
 *
 * Returns: { system, skills: [{name, body}], meta, sources }
 *   - sources tells you which layout was used (for logging / debugging).
 */

function parseFrontmatter(raw) {
  if (!raw || !raw.startsWith('---')) {
    return { meta: {}, body: raw || '' };
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
    version: meta.version || null,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
    allowed_tools: Array.isArray(meta.allowed_tools) ? meta.allowed_tools : [],
    references: Array.isArray(meta.references) ? meta.references : [],
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
 * Load skills from `skills/<name>/SKILL.md` (Anthropic convention).
 * Returns a { [name]: prompt } map.
 */
function loadSkillsDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skills = {};
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const prompt = loadPromptFile(skillFile);
    prompt.folder = entry.name;
    skills[prompt.name] = prompt;
    if (prompt.name !== entry.name) {
      skills[entry.name] = prompt;
    }
  }
  return skills;
}

function pickSystemPrompt(promptsMap, skillsMap, rootDir) {
  const systemCandidates = ['system', 'agent', 'assistant']
    .map((n) => promptsMap[n] || skillsMap[n])
    .filter(Boolean);
  if (systemCandidates.length === 0) {
    throw new Error(
      `No system prompt found under ${rootDir}. ` +
        `Expected prompts/system.md or skills/system/SKILL.md.`
    );
  }
  return systemCandidates[0];
}

/**
 * Loads the primary system prompt and concatenates all skill prompts.
 *
 * Returns: { system, skills: [{name, body}], meta, sources }
 */
function loadBotPrompts(rootDir) {
  const promptsDir = path.join(rootDir, 'prompts');
  const skillsDir = path.join(rootDir, 'skills');

  const hasPrompts = fs.existsSync(promptsDir);
  const hasSkills = fs.existsSync(skillsDir);

  if (!hasPrompts && !hasSkills) {
    throw new Error(
      `No prompts/ or skills/ directory found under ${rootDir}. ` +
        `Create one of them (see skills/INDEX.md).`
    );
  }

  const promptsMap = hasPrompts ? loadPromptsDir(promptsDir) : {};
  const skillsMap = hasSkills ? loadSkillsDir(skillsDir) : {};

  const system = pickSystemPrompt(promptsMap, skillsMap, rootDir);

  // Skills come from skills/ first (Anthropic convention), then from
  // prompts/*.md that are not the system prompt.
  const allSkillNames = new Set();
  for (const p of Object.values(skillsMap)) {
    if (p.name !== system.name) allSkillNames.add(p.name);
  }
  for (const p of Object.values(promptsMap)) {
    if (p.name !== system.name) allSkillNames.add(p.name);
  }
  const skills = [...allSkillNames]
    .map((n) => skillsMap[n] || promptsMap[n])
    .filter(Boolean);

  const sources = {
    prompts: hasPrompts ? promptsDir : null,
    skills: hasSkills ? skillsDir : null,
    layout: hasSkills ? 'anthropic' : 'flat',
  };

  return {
    system,
    skills,
    meta: { count: 1 + skills.length, sources },
    sources,
  };
}

module.exports = {
  parseFrontmatter,
  loadPromptFile,
  loadPromptsDir,
  loadSkillsDir,
  loadBotPrompts,
};
