const DEFAULT_CONFIG = Object.freeze({
  owner: 'fcarrara24',
  repo: 'trmnlx_cdn',
  branch: 'main',
  contentPath: 'content',
});

const STORAGE_KEY = 'trmnl-cdn-config';

function readStoredConfig() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function readParam(name) {
  return new URLSearchParams(window.location.search).get(name)?.trim() || '';
}

function cleanSegment(value, fallback) {
  const cleaned = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  return cleaned || fallback;
}

function normalizeContentPath(value) {
  const cleaned = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned || cleaned.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Percorso dei contenuti non valido');
  }
  return cleaned;
}

export function readConfig() {
  const stored = readStoredConfig();
  const owner = readParam('owner') || stored.owner || DEFAULT_CONFIG.owner;
  const repo = readParam('repo') || stored.repo || DEFAULT_CONFIG.repo;
  const branch = readParam('branch') || stored.branch || DEFAULT_CONFIG.branch;
  const contentPath = readParam('contentPath') || stored.contentPath || DEFAULT_CONFIG.contentPath;

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('Nome proprietario GitHub non valido');
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(repo)) {
    throw new Error('Nome repository GitHub non valido');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(branch)) {
    throw new Error('Nome branch non valido');
  }

  return Object.freeze({
    owner: cleanSegment(owner, DEFAULT_CONFIG.owner),
    repo: cleanSegment(repo, DEFAULT_CONFIG.repo),
    branch: cleanSegment(branch, DEFAULT_CONFIG.branch),
    contentPath: normalizeContentPath(contentPath),
  });
}

export function persistConfig(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function configLabel(value) {
  return `${value.owner}/${value.repo}@${value.branch}`;
}
