/**
 * Test end-to-end di scripts/build-schedule.js su alberi di contenuti temporanei.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/build-schedule.js', import.meta.url));

/** Crea un albero di contenuti temporaneo: { dirName: { meta, files } }. */
async function makeContentTree(packages) {
  const root = await mkdtemp(path.join(tmpdir(), 'trmnl-test-'));
  const contentRoot = path.join(root, 'content');
  for (const [name, { meta, files = {} }] of Object.entries(packages)) {
    const dir = path.join(contentRoot, name);
    await mkdir(dir, { recursive: true });
    if (meta !== undefined) {
      await writeFile(path.join(dir, 'meta.json'), typeof meta === 'string' ? meta : JSON.stringify(meta));
    }
    for (const [file, body] of Object.entries(files)) {
      await writeFile(path.join(dir, file), body);
    }
  }
  return { root, contentRoot, outPath: path.join(root, 'schedule.json') };
}

/** Esegue la build; ritorna { ok, stdout, stderr, schedule }. */
async function runBuild({ contentRoot, outPath }) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      SCRIPT, '--content', contentRoot, '--out', outPath,
    ]);
    return { ok: true, stdout, stderr, schedule: JSON.parse(await readFile(outPath, 'utf8')) };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const validDefault = {
  meta: { id: 'default', type: 'markdown', source: 'content.md', start: '2000-01-01T00:00:00+00:00', priority: 0, enabled: true },
  files: { 'content.md': '# default' },
};

test('genera lo schedule per un albero valido', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    report: {
      meta: { id: 'report', type: 'markdown', source: 'content.md', start: '2026-09-10T08:00:00+02:00', end: '2026-09-10T12:00:00+02:00', priority: 10 },
      files: { 'content.md': '# report' },
    },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, true, result.stderr);
  assert.equal(result.schedule.items.length, 2);
  // start DESC: report precede default.
  assert.deepEqual(result.schedule.items.map((i) => i.id), ['report', 'default']);
  assert.match(result.schedule.items[0].source, /^\/.*\/report\/content\.md$/);
  assert.equal(result.schedule.items[0].end, '2026-09-10T12:00:00+02:00');
  assert.ok(!('end' in result.schedule.items[1]));
});

test('esclude gli item disabilitati mantenendoli validi', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    off: { meta: { id: 'off', type: 'markdown', source: 'c.md', start: '2026-01-01T00:00:00Z', enabled: false }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, true, result.stderr);
  assert.deepEqual(result.schedule.items.map((i) => i.id), ['default']);
});

test('fallisce se manca il contenuto default', async () => {
  const tree = await makeContentTree({
    solo: { meta: { id: 'solo', type: 'markdown', source: 'c.md', start: '2026-01-01T00:00:00Z' }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /"default" è obbligatorio/);
});

test('fallisce su type non supportato', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    bad: { meta: { id: 'bad', type: 'hologram', source: 'c.md', start: '2026-01-01T00:00:00Z' }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /type: "hologram" non supportato/);
});

test('fallisce su source inesistente', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    bad: { meta: { id: 'bad', type: 'markdown', source: 'assente.md', start: '2026-01-01T00:00:00Z' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /source: file "assente\.md" non trovato/);
});

test('fallisce su date senza timezone', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    bad: { meta: { id: 'bad', type: 'markdown', source: 'c.md', start: '2026-01-01T00:00:00' }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /start: timezone mancante/);
});

test('fallisce se end precede start', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    bad: { meta: { id: 'bad', type: 'markdown', source: 'c.md', start: '2026-01-02T00:00:00Z', end: '2026-01-01T00:00:00Z' }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /end: deve essere successivo a start/);
});

test('fallisce se id non corrisponde alla directory', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    'dir-a': { meta: { id: 'altro', type: 'markdown', source: 'c.md', start: '2026-01-01T00:00:00Z' }, files: { 'c.md': 'x' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /non corrisponde alla directory/);
});

test('fallisce su meta.json mancante o malformato', async () => {
  const missing = await makeContentTree({ default: validDefault, vuoto: { files: { 'c.md': 'x' } } });
  const missingResult = await runBuild(missing);
  assert.equal(missingResult.ok, false);
  assert.match(missingResult.stderr, /meta\.json mancante/);

  const broken = await makeContentTree({ default: validDefault, rotto: { meta: '{ non json' } });
  const brokenResult = await runBuild(broken);
  assert.equal(brokenResult.ok, false);
  assert.match(brokenResult.stderr, /JSON non valido/);
});

test('rifiuta source che esce dalla directory del contenuto', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    fuga: { meta: { id: 'fuga', type: 'markdown', source: '../default/content.md', start: '2026-01-01T00:00:00Z' } },
  });
  const result = await runBuild(tree);
  assert.equal(result.ok, false);
  assert.match(result.stderr, /percorso relativo dentro la directory/);
});

test('un nuovo renderer rende valido un nuovo type, senza toccare il core', async () => {
  const tree = await makeContentTree({
    default: validDefault,
    grafico: { meta: { id: 'grafico', type: 'chart', source: 'data.json', start: '2026-01-01T00:00:00Z' }, files: { 'data.json': '[]' } },
  });

  // Senza il renderer, il type non è supportato.
  const before = await runBuild(tree);
  assert.equal(before.ok, false);
  assert.match(before.stderr, /type: "chart" non supportato/);

  // Basta creare src/renderers/chart.js perché diventi valido.
  const renderersDir = path.join(tree.root, 'renderers');
  await mkdir(renderersDir, { recursive: true });
  await writeFile(path.join(renderersDir, 'markdown.js'), 'export const render = () => {};');
  await writeFile(path.join(renderersDir, 'chart.js'), 'export const render = () => {};');

  const { stdout } = await execFileAsync(process.execPath, [
    SCRIPT, '--content', tree.contentRoot, '--out', tree.outPath, '--renderers', renderersDir,
  ]);
  assert.match(stdout, /Renderer disponibili: chart, markdown/);
  const schedule = JSON.parse(await readFile(tree.outPath, 'utf8'));
  assert.deepEqual(schedule.items.map((i) => i.id), ['grafico', 'default']);
});
