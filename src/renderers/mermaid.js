/**
 * Renderer `mermaid`.
 * Carica il diagramma e lo renderizza nel browser.
 */

import { fetchText } from '../utils/fetch.js';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs';

let mermaidPromise;

/**
 * Carica e inizializza Mermaid una sola volta, con un tema monocromatico
 * adatto al display e-ink del TRMNL.
 */
function loadMermaid() {
  mermaidPromise ??= import(/* @vite-ignore */ MERMAID_URL).then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      themeVariables: {
        background: '#ffffff',
        primaryColor: '#ffffff',
        primaryTextColor: '#000000',
        primaryBorderColor: '#000000',
        lineColor: '#000000',
        textColor: '#000000',
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: '16px',
      },
    });
    return mermaid;
  });
  return mermaidPromise;
}

/**
 * @param {{item: object, sourceUrl: string, container: HTMLElement}} ctx
 */
export async function render({ item, sourceUrl, container }) {
  const [mermaid, definition] = await Promise.all([loadMermaid(), fetchText(sourceUrl)]);

  const { svg } = await mermaid.render(`mermaid-${item.id}-${Date.now()}`, definition.trim());

  const figure = document.createElement('div');
  figure.className = 'render-mermaid';
  figure.innerHTML = svg;

  // Il display ha una risoluzione fissa: lasciamo scalare l'SVG al contenitore.
  const svgElement = figure.querySelector('svg');
  if (svgElement) {
    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height');
    svgElement.style.maxWidth = '100%';
    svgElement.style.maxHeight = '100%';
  }

  container.replaceChildren(figure);
}
