/**
 * Helper di rete condivisi dai renderer e dal viewer.
 */

/**
 * Scarica una risorsa evitando la cache del browser: il TRMNL ricarica la
 * pagina periodicamente e deve vedere subito i contenuti aggiornati.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function fetchNoCache(url, init = {}) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} — ${url}`);
  }
  return response;
}

/** @param {string} url */
export async function fetchText(url) {
  return (await fetchNoCache(url)).text();
}

/** @param {string} url */
export async function fetchJson(url) {
  return (await fetchNoCache(url)).json();
}
