'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseFrontmatter,
  loadPromptFile,
  loadPromptsDir,
  loadSkillsDir,
  loadBotPrompts,
} = require('../src/prompts');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-llm-prompts-'));

function writeFile(name, content) {
  const full = path.join(TMP, name);
  fs.writeFileSync(full, content);
  return full;
}

describe('parseFrontmatter', function () {
  it('returns empty meta and full body when no frontmatter is present', function () {
    const raw = '# hello\nthis is just markdown\n';
    const { meta, body } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, raw);
  });

  it('parses YAML frontmatter and the rest as body', function () {
    const raw =
      '---\nname: my-skill\ndescription: |\n  multi\n  line\n---\n# Body\ndo stuff\n';
    const { meta, body } = parseFrontmatter(raw);
    assert.strictEqual(meta.name, 'my-skill');
    assert.match(meta.description, /multi/);
    assert.match(body, /# Body/);
    assert.match(body, /do stuff/);
  });

  it('throws on invalid YAML', function () {
    const bad = '---\n: : : not valid\n---\nbody';
    assert.throws(() => parseFrontmatter(bad), /Invalid YAML/);
  });

  it('treats an unterminated frontmatter block as no frontmatter', function () {
    const raw = '---\nname: x\n# body still here\n';
    const { meta, body } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, raw);
  });
});

describe('loadPromptFile / loadPromptsDir', function () {
  before(function () {
    writeFile('foo.md', '---\nname: foo\ndescription: foo desc\n---\n# Foo body\n');
    writeFile('bar.md', '---\nname: bar\nmodel_hint: small\n---\nbar body\n');
    writeFile('ignore.txt', 'not a prompt');
  });

  it('loads a single prompt file with metadata', function () {
    const p = loadPromptFile(path.join(TMP, 'foo.md'));
    assert.strictEqual(p.name, 'foo');
    assert.strictEqual(p.description, 'foo desc');
    assert.match(p.body, /Foo body/);
    assert.strictEqual(p.model_hint, null);
  });

  it('uses filename as name when frontmatter is missing', function () {
    const f = writeFile('plain.md', '# plain body\n');
    const p = loadPromptFile(f);
    assert.strictEqual(p.name, 'plain');
    assert.strictEqual(p.description, '');
    assert.match(p.body, /plain body/);
  });

  it('reads model_hint when present', function () {
    const p = loadPromptFile(path.join(TMP, 'bar.md'));
    assert.strictEqual(p.model_hint, 'small');
  });

  it('loads all .md files in a directory, skipping non-md', function () {
    const all = loadPromptsDir(TMP);
    assert.ok(all.foo);
    assert.ok(all.bar);
    assert.ok(all.plain);
    assert.strictEqual(all.ignore, undefined);
    assert.strictEqual(Object.keys(all).length, 3);
  });

  it('throws when the prompts directory does not exist', function () {
    assert.throws(
      () => loadPromptsDir(path.join(TMP, 'does-not-exist')),
      /not found/
    );
  });
});

describe('loadBotPrompts', function () {
  it('loads the real prompts/ directory of the project', function () {
    const root = path.resolve(__dirname, '..');
    const bundle = loadBotPrompts(root);
    assert.ok(bundle.system, 'system prompt must be present');
    assert.strictEqual(bundle.system.name, 'whatsapp-responder');
    assert.match(bundle.system.body, /WhatsApp chat assistant/i);
    assert.ok(bundle.skills.length >= 1, 'at least one skill must be present');
    const skillNames = bundle.skills.map((s) => s.name);
    assert.ok(skillNames.includes('whatsapp-reply'));
  });

  it('throws when the prompts directory has no system prompt', function () {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-llm-empty-'));
    fs.mkdirSync(path.join(empty, 'prompts'));
    fs.writeFileSync(
      path.join(empty, 'prompts', 'other.md'),
      '# just something\n'
    );
    assert.throws(() => loadBotPrompts(empty), /No system prompt/);
  });
});

describe('loadSkillsDir (Anthropic convention)', function () {
  const skillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-llm-skills-'));
  before(function () {
    fs.mkdirSync(path.join(skillsRoot, 'my-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsRoot, 'my-skill', 'SKILL.md'),
      '---\nname: my-skill\ndescription: a test skill\nversion: 1.2.3\ntags:\n  - test\ntriggers:\n  - "ping"\nallowed_tools:\n  - my_tool\n---\n# body\ndo the thing\n'
    );
    // a folder without SKILL.md is skipped silently
    fs.mkdirSync(path.join(skillsRoot, 'not-a-skill'), { recursive: true });
  });

  it('loads SKILL.md files from subfolders', function () {
    const skills = loadSkillsDir(skillsRoot);
    assert.ok(skills['my-skill']);
    assert.strictEqual(skills['my-skill'].version, '1.2.3');
    assert.deepStrictEqual(skills['my-skill'].tags, ['test']);
    assert.deepStrictEqual(skills['my-skill'].triggers, ['ping']);
    assert.deepStrictEqual(skills['my-skill'].allowed_tools, ['my_tool']);
    assert.match(skills['my-skill'].body, /do the thing/);
  });

  it('skips folders that do not contain SKILL.md', function () {
    const skills = loadSkillsDir(skillsRoot);
    assert.strictEqual(skills['not-a-skill'], undefined);
  });

  it('returns an empty object when the directory does not exist', function () {
    const skills = loadSkillsDir(path.join(skillsRoot, 'does-not-exist'));
    assert.deepStrictEqual(skills, {});
  });
});

describe('loadBotPrompts (Anthropic layout)', function () {
  it('discovers skills from skills/ subfolders', function () {
    const root = path.resolve(__dirname, '..');
    const bundle = loadBotPrompts(root);
    assert.strictEqual(bundle.meta.sources.layout, 'anthropic');
    const names = bundle.skills.map((s) => s.name);
    assert.ok(names.includes('whatsapp-reply'), `got ${names.join(', ')}`);
    assert.ok(names.includes('summarizer'), `got ${names.join(', ')}`);
    assert.ok(names.includes('translator'), `got ${names.join(', ')}`);
    assert.ok(names.includes('scheduler'), `got ${names.join(', ')}`);
    assert.ok(names.includes('legacy-query'), `got ${names.join(', ')}`);
  });

  it('honors the system prompt from prompts/ when skills/ has no system', function () {
    const root = path.resolve(__dirname, '..');
    const bundle = loadBotPrompts(root);
    assert.strictEqual(bundle.system.name, 'whatsapp-responder');
  });

  it('works with only a skills/ layout (no prompts/)', function () {
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-llm-skillsOnly-'));
    fs.mkdirSync(path.join(fakeRoot, 'skills', 'system'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeRoot, 'skills', 'system', 'SKILL.md'),
      '---\nname: system\n---\nYOU ARE A BOT.\n'
    );
    fs.mkdirSync(path.join(fakeRoot, 'skills', 'echo'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeRoot, 'skills', 'echo', 'SKILL.md'),
      '---\nname: echo\n---\nrepeat the user\n'
    );
    const bundle = loadBotPrompts(fakeRoot);
    assert.strictEqual(bundle.meta.sources.layout, 'anthropic');
    assert.strictEqual(bundle.meta.sources.prompts, null);
    assert.match(bundle.system.body, /YOU ARE A BOT/);
    assert.strictEqual(bundle.skills.length, 1);
    assert.strictEqual(bundle.skills[0].name, 'echo');
  });

  it('works with only a prompts/ layout (no skills/)', function () {
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-llm-promptsOnly-'));
    fs.mkdirSync(path.join(fakeRoot, 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeRoot, 'prompts', 'system.md'),
      '---\nname: system\n---\nPLAIN\n'
    );
    fs.writeFileSync(
      path.join(fakeRoot, 'prompts', 'helper.md'),
      '---\nname: helper\n---\nhelp!\n'
    );
    const bundle = loadBotPrompts(fakeRoot);
    assert.strictEqual(bundle.meta.sources.layout, 'flat');
    assert.strictEqual(bundle.meta.sources.skills, null);
    assert.strictEqual(bundle.skills.length, 1);
    assert.strictEqual(bundle.skills[0].name, 'helper');
  });
});
