import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const OUTPUT = 'public/trmnl.json';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function sourcePathFromSchedule(source) {
  return source.replace(/^\/+/, '');
}

function toEpoch(value) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error(`Data non valida: "${value}"`);
  }

  return Math.floor(timestamp / 1000);
}

async function renderMermaid(sourcePath, outputPath) {
  await execFileAsync('npx', [
    '--no-install',
    'mmdc',
    '-i',
    sourcePath,
    '-o',
    outputPath,
    '-t',
    'neutral',
    '-b',
    'white',
  ]);
}

async function build() {
  const schedule = await readJson('public/schedule.json');

  const items = [];
  const tempDir = path.join('.tmp', 'trmnl');

  await mkdir(tempDir, { recursive: true });

  for (const item of schedule.items ?? []) {
    if (item.enabled === false) {
      continue;
    }

    if (item.type !== 'mermaid') {
      throw new Error(
        `TRMNL build: renderer non ancora supportato: "${item.type}"`,
      );
    }

    const sourcePath = sourcePathFromSchedule(item.source);
    const svgPath = path.join(tempDir, `${item.id}.svg`);

    console.log(`TRMNL: rendering ${sourcePath}`);

    await renderMermaid(sourcePath, svgPath);

    const svg = await readFile(svgPath, 'utf8');

    items.push({
      id: item.id,
      type: item.type,
      start: toEpoch(item.start),
      end: item.end == null ? null : toEpoch(item.end),
      priority: item.priority ?? 0,
      enabled: true,
      content: svg.trim(),
    });
  }

  // Stessa priorità di selezione di src/utils/schedule.js:
  // start DESC, poi priority DESC.
  items.sort((a, b) => (
    b.start - a.start ||
    b.priority - a.priority
  ));

  const output = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });

  await writeFile(
    OUTPUT,
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  );

  console.log(`TRMNL: scritto ${OUTPUT}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});