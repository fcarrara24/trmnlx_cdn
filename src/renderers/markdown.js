/**
 * Renderer `markdown`.
 * Scarica il file e lo renderizza come HTML.
 */

import { fetchText } from '../utils/fetch.js';

const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';

let markedPromise;

/** Carica `marked` una sola volta per sessione. */
function loadMarked() {
  markedPromise ??= import(/* @vite-ignore */ MARKED_URL);
  return markedPromise;
}

/**
 * @param {{item: object, sourceUrl: string, container: HTMLElement}} ctx
 */
export async function render({ sourceUrl, container }) {
  const [{ marked }, text] = await Promise.all([loadMarked(), fetchText(sourceUrl)]);

  const article = document.createElement('article');
  article.className = 'render-markdown';
  article.innerHTML = marked.parse(text, { gfm: true, breaks: false });
  container.replaceChildren(article);
}
