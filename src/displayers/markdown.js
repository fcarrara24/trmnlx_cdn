/**
 * MarkdownDisplayer
 *
 * Gestisce il ciclo di vita completo del rendering markdown:
 * loading, contenuto vuoto, errore e contenuto valido.
 *
 * Uso:
 *   const displayer = new MarkdownDisplayer(container);
 *   await displayer.show(sourceUrl);
 */

import { fetchText } from '../utils/fetch.js';

const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';

let markedPromise;

function loadMarked() {
  markedPromise ??= import(/* @vite-ignore */ MARKED_URL);
  return markedPromise;
}

export class MarkdownDisplayer {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
  }

  /**
   * Scarica e renderizza il markdown da `sourceUrl`.
   * Gestisce loading, vuoto e errore.
   * @param {string} sourceUrl
   */
  async show(sourceUrl) {
    this._showLoading();

    let text;
    try {
      text = await fetchText(sourceUrl);
    } catch (error) {
      this._showError(error.message);
      return;
    }

    if (!text || text.trim() === '') {
      this._showEmpty();
      return;
    }

    try {
      const [{ marked }] = await Promise.all([loadMarked()]);
      const article = document.createElement('article');
      article.className = 'render-markdown';
      article.innerHTML = marked.parse(text, { gfm: true, breaks: false });
      this.container.replaceChildren(article);
    } catch (error) {
      this._showError(error.message);
    }
  }

  _showLoading() {
    const article = document.createElement('article');
    article.className = 'displayer-loading';
    article.innerHTML = '<p>Caricamento…</p>';
    this.container.replaceChildren(article);
  }

  _showEmpty() {
    const article = document.createElement('article');
    article.className = 'displayer-empty';
    article.innerHTML = '<p>Nessun contenuto disponibile.</p>';
    this.container.replaceChildren(article);
  }

  _showError(message) {
    const article = document.createElement('article');
    article.className = 'displayer-error';
    article.innerHTML = '<h1>Contenuto non disponibile</h1>';
    const detail = document.createElement('p');
    detail.textContent = message;
    article.append(detail);
    this.container.replaceChildren(article);
  }
}
