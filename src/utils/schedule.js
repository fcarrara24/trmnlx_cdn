/**
 * Logica di schedule: caricamento e selezione del contenuto attivo.
 * Puro, senza DOM: testabile e privo di conoscenza dei singoli contenuti.
 */

/** Data usata quando un item non dichiara `start`. */
const ALWAYS_ACTIVE = '2000-01-01T00:00:00+00:00';

/** Id del contenuto usato come fallback quando nulla è attivo. */
export const DEFAULT_ID = 'default';

/**
 * Verifica se un item è attivo all'istante `now`.
 * @param {object} item item dello schedule
 * @param {Date} now istante corrente
 */
export function isActive(item, now) {
  if (item.enabled === false) return false;

  const start = new Date(item.start ?? ALWAYS_ACTIVE);
  if (Number.isNaN(start.getTime()) || start > now) return false;

  if (item.end === undefined || item.end === null) return true;
  const end = new Date(item.end);
  if (Number.isNaN(end.getTime())) return false;
  return end > now;
}

/**
 * Seleziona il contenuto da visualizzare.
 *
 * Ordina gli item attivi per start DESC, poi priority DESC, e ritorna il primo.
 * In assenza di item attivi ritorna il contenuto `default`, se presente.
 *
 * @param {{items?: object[]}} schedule schedule.json deserializzato
 * @param {Date} [now] istante di valutazione
 * @returns {object|null} item selezionato
 */
export function selectContent(schedule, now = new Date()) {
  const items = Array.isArray(schedule?.items) ? schedule.items : [];

  const active = items
    .filter((item) => isActive(item, now))
    .sort((a, b) => (
      new Date(b.start ?? ALWAYS_ACTIVE) - new Date(a.start ?? ALWAYS_ACTIVE)
      || (b.priority ?? 0) - (a.priority ?? 0)
    ));

  if (active.length > 0) return active[0];

  return items.find((item) => item.id === DEFAULT_ID && item.enabled !== false) ?? null;
}

/**
 * Risolve un percorso dello schedule (assoluto rispetto alla root del sito)
 * contro la base URL del viewer, così il sistema funziona anche quando è
 * pubblicato in una sottodirectory (GitHub Pages project site).
 *
 * @param {string} source percorso, es. "/content/default/content.md"
 * @param {string|URL} [base] base URL del sito
 */
export function resolveSource(source, base = document.baseURI) {
  return new URL(source.replace(/^\//, ''), base).href;
}
