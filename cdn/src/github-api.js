/**
 * Client minimale per la GitHub Contents API.
 *
 * Ogni funzione prende esplicitamente { owner, repo, branch, token, ... }
 * invece di leggere uno stato globale, così resta testabile senza DOM.
 */

const API = 'https://api.github.com';

function encodePath(path) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

/** @param {{path: string, method?: string, body?: object, token: string}} opts */
async function request({ path, method = 'GET', body, token }) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message || `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * Legge un file. Ritorna null se non esiste (404), invece di lanciare,
 * perché "il file non c'è ancora" è un caso normale in un editor.
 */
export async function getFile({ owner, repo, branch, path, token, encoding = 'utf8' }) {
  try {
    const data = await request({ path: `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${branch}`, token });
    if (Array.isArray(data)) throw new Error(`${path} è una directory, non un file`);
    const raw = data.content.replace(/\n/g, '');
    return { sha: data.sha, content: encoding === 'base64' ? raw : b64DecodeUnicode(raw) };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** Elenca una directory. Ritorna [] se non esiste. */
export async function listDir({ owner, repo, branch, path, token }) {
  try {
    const data = await request({ path: `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${branch}`, token });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

/**
 * Crea o aggiorna un file (serve `sha` per aggiornare un file esistente,
 * altrimenti GitHub risponde 409/422).
 */
export async function putFile({ owner, repo, branch, path, content, message, sha, token, encoding = 'utf8' }) {
  return request({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    method: 'PUT',
    token,
    body: {
      message,
      branch,
      content: encoding === 'base64' ? content : b64EncodeUnicode(content),
      ...(sha ? { sha } : {}),
    },
  });
}

export async function deleteFile({ owner, repo, branch, path, message, sha, token }) {
  return request({
    path: `/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    method: 'DELETE',
    token,
    body: { message, branch, sha },
  });
}
