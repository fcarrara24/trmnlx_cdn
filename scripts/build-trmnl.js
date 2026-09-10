import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { marked } from 'marked';

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
  const puppeteerConfig = path.join('.tmp', 'puppeteer-config.json');

  await mkdir(path.dirname(puppeteerConfig), { recursive: true });

  await writeFile(
    puppeteerConfig,
    JSON.stringify({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }),
    'utf8',
  );

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
    '--puppeteerConfigFile',
    puppeteerConfig,
  ]);
}

async function renderMarkdown(sourcePath) {
  const markdown = await readFile(sourcePath, 'utf8');

  const html = marked.parse(markdown, {
    gfm: true,
    breaks: false,
  });

  return `<article class="render-markdown">${html}</article>`;
}

async function renderItem(item) {
  const sourcePath = sourcePathFromSchedule(item.source);

  switch (item.type) {
    case 'mermaid': {
      const tempDir = path.join('.tmp', 'trmnl');
      const svgPath = path.join(tempDir, `${item.id}.svg`);

      await mkdir(tempDir, { recursive: true });

      console.log(`  Rendering Mermaid: ${sourcePath}`);

      await renderMermaid(sourcePath, svgPath);

      return (await readFile(svgPath, 'utf8')).trim();
    }

    case 'markdown':
      console.log(`  Rendering Markdown: ${sourcePath}`);
      return renderMarkdown(sourcePath);

    default:
      throw new Error(
        `TRMNL build: renderer non ancora supportato: "${item.type}"`,
      );
  }
}

async function build() {
  const schedule = await readJson('public/schedule.json');

  const items = [];

  for (const item of schedule.items ?? []) {
    if (item.enabled === false) {
      continue;
    }

    const content = await renderItem(item);

    items.push({
      id: item.id,
      type: item.type,
      start: toEpoch(item.start),
      end: item.end == null ? null : toEpoch(item.end),
      priority: item.priority ?? 0,
      enabled: true,
      content,
    });
  }

  // Stessa regola di src/utils/schedule.js:
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

  console.log(`Scritto ${OUTPUT} con ${items.length} item.`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});