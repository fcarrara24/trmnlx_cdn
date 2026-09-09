/**
 * Renderer `image`.
 * Visualizza l'immagine adattandola allo schermo mantenendo le proporzioni.
 */

/**
 * @param {{item: object, sourceUrl: string, container: HTMLElement}} ctx
 */
export async function render({ item, sourceUrl, container }) {
  const image = document.createElement('img');
  image.className = 'render-image';
  image.alt = item.title ?? item.id;
  image.decoding = 'sync';

  const loaded = new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve());
    image.addEventListener('error', () => reject(new Error(`Immagine non caricata: ${sourceUrl}`)));
  });

  image.src = sourceUrl;
  container.replaceChildren(image);
  await loaded;
}
