/**
 * Autenticazione GitHub via Personal Access Token.
 *
 * Il token vive solo in questo browser (sessionStorage): non viene mai
 * salvato lato server, non viene mai committato. All'uscita dalla pagina o
 * al refresh della scheda il token scompare.
 *
 * Non usiamo l'OAuth flow because GitHub Pages non può hostare un callback
 * affidabile: un token con scope `repo` è sufficiente per leggere/scrivere
 * un singolo repository.
 */

const SESSION_KEY = 'trmnl-cdn-token';

/** @type {string|null} */
let token = null;

/** @type {object|null} */
let user = null;

/**
 * Salva il token in sessionStorage (sopravvive a un reload della scheda,
 * ma non alla chiusura del browser).
 */
export function saveToken(value) {
  token = value;
  if (typeof sessionStorage !== 'undefined') {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  }
}

/** Restituisce il token corrente o null. */
export function getToken() {
  if (token) return token;
  if (typeof sessionStorage !== 'undefined') {
    token = sessionStorage.getItem(SESSION_KEY);
  }
  return token;
}

/** Restituisce l'header Authorization corrente o null. */
export function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : null;
}

/** @param {object} u */
export function setUser(u) {
  user = u;
}

/** @returns {object|null} */
export function getUser() {
  return user;
}

/** Cancella il token corrente (logout). */
export function clearToken() {
  token = null;
  user = null;
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Verifica che il token sia valido e ne recupera l'utente.
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
export async function verifyToken() {
  const t = getToken();
  if (!t) return { ok: false, error: 'Token mancante' };

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${t}`,
      },
    });

    if (response.status === 401) {
      return { ok: false, error: 'Token non valido o scaduto' };
    }
    if (!response.ok) {
      return { ok: false, error: `GitHub API: ${response.status} ${response.statusText}` };
    }

    user = await response.json();
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error: `Rete: ${error.message}` };
  }
}
