/**
 * Caricamento dei renderer per convenzione.
 *
 * Il core non contiene un elenco di tipi: un `type` viene mappato sul modulo
 * `src/renderers/<type>.js`, caricato on demand. Per aggiungere un tipo di
 * contenuto è sufficiente creare quel file esportando:
 *
 *   export async function render({ item, sourceUrl, container }) { ... }
 *
 * Nessuna modifica al core è necessaria; `scripts/build-schedule.js` deduce i
 * tipi supportati dai file presenti in questa directory.
 */

/** Un `type` deve essere un nome di file sicuro: nessun percorso, nessuna estensione. */
const TYPE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Carica il renderer per un tipo di contenuto.
 * @param {string} type
 * @returns {Promise<{render: Function}>}
 */
export async function loadRenderer(type) {
  if (typeof type !== 'string' || !TYPE_PATTERN.test(type)) {
    throw new Error(`Type non valido: "${type}"`);
  }

  let module;
  try {
    module = await import(new URL(`./${type}.js`, import.meta.url).href);
  } catch (error) {
    throw new Error(`Nessun renderer per il type "${type}" (${error.message})`);
  }

  if (typeof module.render !== 'function') {
    throw new Error(`Il renderer "${type}" non esporta una funzione render()`);
  }
  return module;
}
