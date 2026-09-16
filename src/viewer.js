/**
 * Generic Viewer.
 *
 * Flusso: fetch schedule.json → determina l'istante corrente → seleziona il
 * contenuto attivo → scarica la source → seleziona il renderer per type → render.
 *
 * Il core non contiene alcuna logica specifica di un contenuto: sa solo
 * determinare quale contenuto è attivo e delegarne il rendering.
 */

import { selectContent, resolveSource, DEFAULT_ID } from './utils/schedule.js';
import { loadRenderer } from './renderers/index.js';
import { fetchJson } from './utils/fetch.js';

/** Percorso dello schedule generato dalla build, relativo alla root del sito. */
const SCHEDULE_PATH = 'schedule.json';

/** Intervallo di ricontrollo dello schedule. */
const REFRESH_MS = 60_000;

/** Item attualmente renderizzato, per evitare re-render inutili. */
let currentKey = null;

/** @param {string} message */
function showError(message) {
  const container = document.querySelector('#content');
  const article = document.createElement('article');
  article.className = 'render-markdown viewer-error';
  article.innerHTML = '<h1>Contenuto non disponibile</h1>';
  const detail = document.createElement('p');
  detail.textContent = message;
  article.append(detail);
  container.replaceChildren(article);
  console.error(message);
}

/**
 * Aggiorna gli indicatori di stato (utili in debug da browser, invisibili
 * sul display se l'elemento non è presente).
 * @param {object|null} item
 */
function updateStatus(item, generatedAt) {
  const status = document.querySelector('#status');
  if (!status) return;
  status.textContent = item
    ? `${item.id} · ${item.type} · schedule ${generatedAt ?? 'n/d'}`
    : 'nessun contenuto';
  document.documentElement.dataset.contentId = item?.id ?? '';
  document.documentElement.dataset.contentType = item?.type ?? '';
}

/**
 * Renderizza un item dello schedule.
 * @param {object} item
 */
async function renderItem(item) {
  const container = document.querySelector('#content');
  const sourceUrl = resolveSource(item.source);
  const renderer = await loadRenderer(item.type);
  await renderer.render({ item, sourceUrl, container });
}

/**
 * Un ciclo completo di valutazione: ricarica lo schedule e renderizza il
 * contenuto attivo se è cambiato rispetto a quello a schermo.
 */
async function tick() {
  let schedule;
  try {
    schedule = await fetchJson(resolveSource(SCHEDULE_PATH));
  } catch (error) {
    // Se lo schedule non è raggiungibile, manteniamo a schermo il contenuto
    // già renderizzato: un errore di rete non deve svuotare il display.
    if (currentKey) {
      console.warn(`Schedule non ricaricato: ${error.message}`);
      return;
    }
    showError(`Impossibile caricare ${SCHEDULE_PATH}: ${error.message}`);
    return;
  }

  const item = selectContent(schedule, new Date());

  if (!item) {
    showError(`Nessun contenuto attivo e nessun contenuto "${DEFAULT_ID}" nello schedule.`);
    currentKey = null;
    return;
  }

  // La chiave include generatedAt così un nuovo deploy forza il re-render
  // anche a parità di item selezionato.
  const key = `${item.id}|${item.source}|${schedule.generatedAt ?? ''}`;
  if (key === currentKey) return;

  try {
    await renderItem(item);
    currentKey = key;
    updateStatus(item, schedule.generatedAt);
  } catch (error) {
    // Ultimo tentativo: se il contenuto selezionato non è renderizzabile,
    // ricadiamo sul default invece di lasciare il display vuoto.
    const fallback = item.id === DEFAULT_ID
      ? null
      : schedule.items?.find((candidate) => candidate.id === DEFAULT_ID);

    if (!fallback) {
      showError(`Rendering di "${item.id}" fallito: ${error.message}`);
      currentKey = null;
      return;
    }

    console.warn(`Rendering di "${item.id}" fallito (${error.message}), uso il default.`);
    try {
      await renderItem(fallback);
      currentKey = `${fallback.id}|${fallback.source}|${schedule.generatedAt ?? ''}`;
      updateStatus(fallback, schedule.generatedAt);
    } catch (fallbackError) {
      showError(`Rendering del default fallito: ${fallbackError.message}`);
      currentKey = null;
    }
  }
}

/** Avvia il viewer. */
export function start() {
  tick();
  setInterval(tick, REFRESH_MS);
  // Il TRMNL può risvegliare la pagina dopo uno sleep: rivalutiamo subito.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

start();
