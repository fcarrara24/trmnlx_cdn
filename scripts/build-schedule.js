#!/usr/bin/env node
/**
 * Scansiona /content, valida ogni meta.json e genera public/schedule.json.
 *
 * Nessuna dipendenza esterna: viene eseguito durante la build/deploy della
 * GitHub Action, non produce commit nella repository.
 *
 * Uso:
 *   node scripts/build-schedule.js [--out public/schedule.json] [--content content]
 *                                   [--renderers src/renderers]
 */

import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Tipi supportati: dedotti dai file presenti in src/renderers/, così aggiungere
 * un renderer non richiede di aggiornare questo script.
 */
async function discoverSupportedTypes(renderersDir) {
  const entries = await readdir(renderersDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js')
    .map((entry) => entry.name.replace(/\.js$/, ''))
    .sort();
}

/** Campi obbligatori in ogni meta.json. */
const REQUIRED_FIELDS = ['id', 'type', 'source'];

function parseArgs(argv) {
  const args = { content: 'content', out: 'public/schedule.json', renderers: 'src/renderers' };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inlineValue] = argv[i].split('=');
    const value = inlineValue ?? argv[i + 1];
    if (flag === '--content' || flag === '--out' || flag === '--renderers') {
      args[flag.slice(2)] = value;
      if (inlineValue === undefined) i += 1;
    }
  }
  return args;
}

/**
 * Valida una data ISO 8601 con timezone esplicito.
 * Rifiuta le date "naive" (senza Z o offset) perché il viewer confronta
 * istanti assoluti.
 */
function parseIsoDate(value, field, errors) {
  if (typeof value !== 'string') {
    errors.push(`${field}: deve essere una stringa ISO 8601`);
    return null;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    errors.push(`${field}: timezone mancante (atteso ISO 8601 con Z o offset)`);
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field}: data non valida ("${value}")`);
    return null;
  }
  return date;
}

async function readMeta(contentRoot, dirName, errors) {
  const metaPath = path.join(contentRoot, dirName, 'meta.json');
  if (!existsSync(metaPath)) {
    errors.push(`${dirName}: meta.json mancante`);
    return null;
  }
  try {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  } catch (error) {
    errors.push(`${dirName}/meta.json: JSON non valido (${error.message})`);
    return null;
  }
}

/**
 * Trasforma un meta.json in un item dello schedule, accumulando gli errori.
 * Ritorna null se il contenuto non è valido o è disabilitato.
 */
async function buildItem(contentRoot, dirName, seenIds, supportedTypes, errors) {
  const meta = await readMeta(contentRoot, dirName, errors);
  if (!meta) return null;

  const localErrors = [];

  for (const field of REQUIRED_FIELDS) {
    if (typeof meta[field] !== 'string' || meta[field].trim() === '') {
      localErrors.push(`${field}: campo obbligatorio mancante`);
    }
  }

  if (meta.id && meta.id !== dirName) {
    localErrors.push(`id: "${meta.id}" non corrisponde alla directory "${dirName}"`);
  }
  if (meta.id && seenIds.has(meta.id)) {
    localErrors.push(`id: "${meta.id}" duplicato`);
  }

  if (meta.type && !supportedTypes.includes(meta.type)) {
    localErrors.push(`type: "${meta.type}" non supportato (attesi: ${supportedTypes.join(', ')})`);
  }

  if (meta.source) {
    if (meta.source.includes('..') || path.isAbsolute(meta.source)) {
      localErrors.push(`source: deve essere un percorso relativo dentro la directory del contenuto`);
    } else if (!existsSync(path.join(contentRoot, dirName, meta.source))) {
      localErrors.push(`source: file "${meta.source}" non trovato`);
    }
  }

  // start è opzionale: se assente il contenuto è considerato sempre attivo.
  const start = meta.start === undefined
    ? null
    : parseIsoDate(meta.start, 'start', localErrors);
  const end = meta.end === undefined || meta.end === null
    ? null
    : parseIsoDate(meta.end, 'end', localErrors);

  if (start && end && end.getTime() <= start.getTime()) {
    localErrors.push('end: deve essere successivo a start');
  }

  if (meta.priority !== undefined && !Number.isFinite(meta.priority)) {
    localErrors.push('priority: deve essere un numero');
  }
  if (meta.enabled !== undefined && typeof meta.enabled !== 'boolean') {
    localErrors.push('enabled: deve essere un booleano');
  }

  if (localErrors.length > 0) {
    errors.push(...localErrors.map((message) => `${dirName}: ${message}`));
    return null;
  }

  seenIds.add(meta.id);

  if (meta.enabled === false) {
    console.log(`  - ${dirName}: disabilitato, escluso dallo schedule`);
    return null;
  }

  const item = {
    id: meta.id,
    type: meta.type,
    // Percorso assoluto rispetto alla root del sito; il viewer lo risolve
    // contro la propria base URL per funzionare anche nei project site.
    source: `/${path.posix.join(contentRoot.split(path.sep).join('/'), dirName, meta.source)}`,
    start: meta.start ?? '2000-01-01T00:00:00+00:00',
    priority: meta.priority ?? 0,
  };
  if (meta.end) item.end = meta.end;
  if (meta.title) item.title = meta.title;
  if (meta.options && typeof meta.options === 'object') item.options = meta.options;

  return item;
}

async function listContentDirs(contentRoot) {
  const entries = await readdir(contentRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const { content: contentRoot, out: outPath, renderers: renderersDir } = parseArgs(process.argv.slice(2));

  if (!existsSync(contentRoot) || !(await stat(contentRoot)).isDirectory()) {
    console.error(`Directory dei contenuti non trovata: ${contentRoot}`);
    process.exit(1);
  }

  const supportedTypes = await discoverSupportedTypes(renderersDir);
  console.log(`Renderer disponibili: ${supportedTypes.join(', ')}`);

  const dirs = await listContentDirs(contentRoot);
  console.log(`Scansione di ${dirs.length} contenuti in ${contentRoot}/`);

  const errors = [];
  const seenIds = new Set();
  const items = [];

  for (const dirName of dirs) {
    const item = await buildItem(contentRoot, dirName, seenIds, supportedTypes, errors);
    if (item) {
      items.push(item);
      console.log(`  - ${item.id}: ${item.type} (priority ${item.priority})`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nValidazione fallita con ${errors.length} errore/i:`);
    for (const message of errors) console.error(`  ! ${message}`);
    process.exit(1);
  }

  if (!seenIds.has('default')) {
    console.error('\nValidazione fallita: il contenuto "default" è obbligatorio (fallback del viewer).');
    process.exit(1);
  }

  // Ordinamento come da algoritmo di selezione: start DESC, poi priority DESC.
  // Il viewer riordina comunque, questo rende lo schedule leggibile a colpo d'occhio.
  items.sort((a, b) => (
    new Date(b.start) - new Date(a.start) || b.priority - a.priority
  ));

  const schedule = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(schedule, null, 2)}\n`, 'utf8');

  console.log(`\nScritto ${outPath} con ${items.length} item attivi.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
