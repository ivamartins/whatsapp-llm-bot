'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseFrontmatter,
  loadPromptFile,
  loadPromptsDir,
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
