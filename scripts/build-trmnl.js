import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CONTENT_ROOT = 'content';
const OUTPUT = 'public/trmnl.json';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
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

function toEpoch(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

async function build() {
  const schedule = await readJson('public/schedule.json');

  const items = [];

  for (const item of schedule.items) {
    const sourcePath = path.join(
      CONTENT_ROOT,
      item.id,
      path.basename(item.source),
    );

    if (item.type !== 'mermaid') {
      throw new Error(
        `TRMNL build: renderer non ancora supportato: "${item.type}"`,
      );
    }

    const tempDir = path.join('.tmp', 'trmnl');
    const svgPath = path.join(tempDir, `${item.id}.svg`);

    await mkdir(tempDir, { recursive: true });

    await renderMermaid(sourcePath, svgPath);

    const svg = await readFile(svgPath, 'utf8');

    items.push({
      id: item.id,
      type: item.type,
      start: toEpoch(item.start),
      end: item.end == null ? null : toEpoch(item.end),
      priority: item.priority ?? 0,
      enabled: item.enabled !== false,
      content: svg,
    });
  }

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