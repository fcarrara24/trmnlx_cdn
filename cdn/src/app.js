/**
 * Editor TRMNL CDN.
 *
 * Legge/scrive direttamente i content package del repository (content/<id>/)
 * tramite la GitHub Contents API, usando un Personal Access Token fornito
 * dall'utente. Nessun backend: gira interamente nel browser, ospitato su
 * GitHub Pages come il resto del sito.
 */

import { saveToken, getToken, clearToken, verifyToken, setUser, getUser, authHeader } from './auth.js';
import { readConfig, persistConfig, configLabel } from './config.js';
import { getFile, listDir, putFile, deleteFile } from './github-api.js';

const DEFAULT_SOURCE_BY_TYPE = {
  markdown: 'content.md',
  mermaid: 'diagram.mmd',
  image: 'image.png',
};

let config = null;
let currentIds = [];
let supportedTypes = [];
let selectedId = null;
/** sha dei due file del content package selezionato, per poter fare update invece di create. */
let currentShas = { meta: null, source: null };
/** Per il type "image": dataURL scelto tramite <input type="file">, in attesa di push. */
let pendingImage = null;
let previewReady = false;
let previewTimer = null;

const el = {
  authOverlay: document.querySelector('#auth-overlay'),
  tokenInput: document.querySelector('#token-input'),
  authBtn: document.querySelector('#auth-btn'),
  authError: document.querySelector('#auth-error'),
  app: document.querySelector('#app'),
  userPill: document.querySelector('#user-pill'),
  logoutBtn: document.querySelector('#logout-btn'),
  contentSelect: document.querySelector('#content-select'),
  newBtn: document.querySelector('#new-btn'),
  deleteBtn: document.querySelector('#delete-btn'),
  idInput: document.querySelector('#id-input'),
  typeSelect: document.querySelector('#type-select'),
  sourceInput: document.querySelector('#source-input'),
  startInput: document.querySelector('#start-input'),
  endInput: document.querySelector('#end-input'),
  priorityInput: document.querySelector('#priority-input'),
  enabledInput: document.querySelector('#enabled-input'),
  titleInput: document.querySelector('#title-input'),
  contentTextarea: document.querySelector('#content-textarea'),
  optionsTextarea: document.querySelector('#options-textarea'),
  pushBtn: document.querySelector('#push-btn'),
  pushStatus: document.querySelector('#push-status'),
  previewFrame: document.querySelector('#preview-frame'),
  previewMode: document.querySelector('#preview-mode'),
  statusText: document.querySelector('#status-text'),
  toast: document.querySelector('#toast'),
};

function setStatus(message) {
  el.statusText.textContent = message;
}

function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  el.toast.classList.toggle('toast-error', isError);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.hidden = true; }, 4000);
}

function setPushStatus(message, kind = '') {
  el.pushStatus.textContent = message;
  el.pushStatus.classList.remove('ok', 'error');
  if (kind) el.pushStatus.classList.add(kind);
}

// ---------- Auth ----------

async function tryResumeSession() {
  // 1. Prova il token salvato in session
  if (getToken()) {
    const result = await verifyToken();
    if (result.ok) {
      setUser(result.user);
      return true;
    }
    clearToken();
  }

  // 2. Fallback: prova a recuperare un token di sviluppo dal server locale
  try {
    const response = await fetch('/api/dev-token');
    if (response.ok) {
      const { token: devToken } = await response.json();
      saveToken(devToken);
      const result = await verifyToken();
      if (result.ok) {
        setUser(result.user);
        return true;
      }
      clearToken();
    }
  } catch (e) {
    // Il server locale potrebbe non rispondere (es. su GitHub Pages)
  }

  return false;
}

async function handleAuth() {
  const value = el.tokenInput.value.trim();
  if (!value) return;
  el.authBtn.disabled = true;
  el.authError.hidden = true;
  saveToken(value);

  const result = await verifyToken();
  el.authBtn.disabled = false;

  if (!result.ok) {
    clearToken();
    el.authError.textContent = result.error;
    el.authError.hidden = false;
    return;
  }

  setUser(result.user);
  await enterApp();
}

function handleLogout() {
  clearToken();
  el.app.hidden = true;
  el.authOverlay.hidden = false;
  el.tokenInput.value = '';
  document.body.dataset.authed = 'false';
}

async function enterApp() {
  document.body.dataset.authed = 'true';
  el.authOverlay.hidden = true;
  el.app.hidden = false;

  const user = getUser();
  if (user) {
    el.userPill.hidden = false;
    el.userPill.textContent = `${user.login}`;
  }

  config = readConfig();
  persistConfig(config);
  setStatus(`Connesso a ${configLabel(config)}`);

  await loadSupportedTypes();
  await refreshContentList();
}

// ---------- Config / discovery ----------

async function loadSupportedTypes() {
  const entries = await listDir({ ...config, path: 'src/renderers', token: getToken() });
  supportedTypes = entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.js') && e.name !== 'index.js')
    .map((e) => e.name.replace(/\.js$/, ''))
    .sort();

  el.typeSelect.replaceChildren(
    ...supportedTypes.map((type) => new Option(type, type)),
  );
}

async function refreshContentList(selectAfter) {
  const entries = await listDir({ ...config, path: config.contentPath, token: getToken() });
  currentIds = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();

  el.contentSelect.replaceChildren(
    ...currentIds.map((id) => new Option(id, id)),
  );

  const target = selectAfter && currentIds.includes(selectAfter) ? selectAfter : currentIds[0];
  if (target) {
    el.contentSelect.value = target;
    await loadContent(target);
  } else {
    resetForm();
  }
}

// ---------- Form <-> content package ----------

function resetForm() {
  selectedId = null;
  currentShas = { meta: null, source: null };
  pendingImage = null;
  el.idInput.value = '';
  el.idInput.disabled = false;
  el.typeSelect.value = supportedTypes[0] ?? '';
  el.sourceInput.value = DEFAULT_SOURCE_BY_TYPE[el.typeSelect.value] ?? 'content.txt';
  
  // Pre-popola 'start' con ora corrente
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  el.startInput.value = now.toISOString().slice(0, 16);
  el.endInput.value = '';
  
  el.priorityInput.value = '0';
  el.enabledInput.checked = true;
  el.titleInput.value = '';
  el.contentTextarea.value = '';
  el.optionsTextarea.value = '';
  el.deleteBtn.disabled = true;
  el.pushBtn.disabled = false;
  updateContentFieldVisibility();
  schedulePreview();
}

async function loadContent(id) {
  setStatus(`Carico ${id}…`);
  const metaFile = await getFile({ ...config, path: `${config.contentPath}/${id}/meta.json`, token: getToken() });
  if (!metaFile) {
    toast(`meta.json non trovato per "${id}"`, true);
    return;
  }

  let meta;
  try {
    meta = JSON.parse(metaFile.content);
  } catch (error) {
    toast(`meta.json di "${id}" non è JSON valido: ${error.message}`, true);
    return;
  }

  selectedId = id;
  currentShas.meta = metaFile.sha;
  pendingImage = null;

  el.idInput.value = id;
  el.idInput.disabled = true; // rinominare = creare+eliminare, non un update
  el.typeSelect.value = meta.type ?? supportedTypes[0] ?? '';
  el.sourceInput.value = meta.source ?? '';
  
  // Conversione ISO per datetime-local
  const formatForInput = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  };
  
  el.startInput.value = formatForInput(meta.start);
  el.endInput.value = formatForInput(meta.end);
  el.priorityInput.value = String(meta.priority ?? 0);
  el.enabledInput.checked = meta.enabled !== false;
  el.titleInput.value = meta.title ?? '';
  el.optionsTextarea.value = meta.options ? JSON.stringify(meta.options, null, 2) : '';
  el.deleteBtn.disabled = false;
  el.pushBtn.disabled = false;

  updateContentFieldVisibility();

  if (meta.source) {
    const isImage = meta.type === 'image';
    const sourceFile = await getFile({
      ...config,
      path: `${config.contentPath}/${id}/${meta.source}`,
      token: getToken(),
      encoding: isImage ? 'base64' : 'utf8',
    });
    currentShas.source = sourceFile?.sha ?? null;

    if (isImage) {
      el.contentTextarea.value = '';
      if (sourceFile) {
        const mime = meta.source.toLowerCase().endsWith('.jpg') || meta.source.toLowerCase().endsWith('.jpeg')
          ? 'image/jpeg'
          : meta.source.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
        pendingImage = { dataUrl: `data:${mime};base64,${sourceFile.content}` };
      }
    } else {
      el.contentTextarea.value = sourceFile?.content ?? '';
    }
  }

  setStatus(`"${id}" caricato.`);
  schedulePreview();
}

const uploadBtn = document.createElement('button');
uploadBtn.type = 'button';
uploadBtn.id = 'upload-image-btn';
uploadBtn.className = 'btn btn-ghost';
uploadBtn.textContent = 'Carica immagine…';
uploadBtn.hidden = true;

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.hidden = true;

function updateContentFieldVisibility() {
  const isImage = el.typeSelect.value === 'image';
  el.contentTextarea.hidden = isImage;
  uploadBtn.hidden = !isImage;
}

// ---------- Preview ----------

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(sendPreview, 250);
}

function sendPreview() {
  if (!previewReady || !el.previewFrame.contentWindow) return;

  const type = el.typeSelect.value;
  const item = {
    id: el.idInput.value || 'preview',
    type,
    title: el.titleInput.value || undefined,
  };

  let text = el.contentTextarea.value;
  let isBinary = false;

  if (type === 'image' && pendingImage) {
    text = pendingImage.dataUrl;
    isBinary = true;
  }

  el.previewMode.textContent = `${item.id} · ${type}`;
  el.previewFrame.contentWindow.postMessage({ item: { ...item, isBinary }, text }, '*');
}

// ---------- Push / delete ----------

function buildMeta() {
  const id = el.idInput.value.trim();
  const type = el.typeSelect.value;
  const source = el.sourceInput.value.trim();

  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error('ID non valido: usa solo lettere, numeri, punto, trattino, underscore.');
  }
  if (!type) throw new Error('Seleziona un tipo.');
  if (!source) throw new Error('Il file sorgente è obbligatorio.');

  let options;
  const optionsRaw = el.optionsTextarea.value.trim();
  if (optionsRaw) {
    try {
      options = JSON.parse(optionsRaw);
    } catch (error) {
      throw new Error(`Opzioni non sono JSON valido: ${error.message}`);
    }
  }

  const meta = { id, type, source };
  // Prendi il valore dell'input datetime-local e convertilo in ISO
  if (el.startInput.value) meta.start = new Date(el.startInput.value).toISOString();
  if (el.endInput.value) meta.end = new Date(el.endInput.value).toISOString();
  
  meta.priority = Number(el.priorityInput.value) || 0;
  meta.enabled = el.enabledInput.checked;
  if (el.titleInput.value.trim()) meta.title = el.titleInput.value.trim();
  if (options) meta.options = options;

  return meta;
}

async function handlePush() {
  let meta;
  try {
    meta = buildMeta();
  } catch (error) {
    setPushStatus(error.message, 'error');
    return;
  }

  el.pushBtn.disabled = true;
  setPushStatus('Push in corso…');

  const isNew = meta.id !== selectedId;
  const basePath = `${config.contentPath}/${meta.id}`;
  const token = getToken();

  try {
    // Se rinominato/nuovo, ripartiamo da sha nulli: creazione, non update.
    const metaSha = isNew ? null : currentShas.meta;
    const sourceSha = isNew ? null : currentShas.source;

    if (meta.type === 'image' && pendingImage) {
      const base64 = pendingImage.dataUrl.split(',')[1];
      const result = await putFile({
        ...config,
        path: `${basePath}/${meta.source}`,
        content: base64,
        encoding: 'base64',
        message: `cdn: aggiorna ${meta.id}/${meta.source}`,
        sha: sourceSha,
        token,
      });
      currentShas.source = result.content.sha;
    } else if (meta.type !== 'image') {
      const result = await putFile({
        ...config,
        path: `${basePath}/${meta.source}`,
        content: el.contentTextarea.value,
        message: `cdn: aggiorna ${meta.id}/${meta.source}`,
        sha: sourceSha,
        token,
      });
      currentShas.source = result.content.sha;
    }

    const metaResult = await putFile({
      ...config,
      path: `${basePath}/meta.json`,
      content: `${JSON.stringify(meta, null, 2)}\n`,
      message: `cdn: aggiorna ${meta.id}/meta.json`,
      sha: metaSha,
      token,
    });
    currentShas.meta = metaResult.content.sha;

    setPushStatus(`Pushato su ${config.branch}.`, 'ok');
    toast(`"${meta.id}" pubblicato. La build di Pages lo raccoglierà al prossimo deploy.`);
    await refreshContentList(meta.id);
  } catch (error) {
    setPushStatus(`Errore: ${error.message}`, 'error');
  } finally {
    el.pushBtn.disabled = false;
  }
}

async function handleDelete() {
  if (!selectedId) return;

  const token = getToken();
  const basePath = `${config.contentPath}/${selectedId}`;

  try {
    if (currentShas.source) {
      await deleteFile({
        ...config,
        path: `${basePath}/${el.sourceInput.value.trim()}`,
        message: `cdn: elimina ${selectedId}`,
        sha: currentShas.source,
        token,
      });
    }
    if (currentShas.meta) {
      await deleteFile({
        ...config,
        path: `${basePath}/meta.json`,
        message: `cdn: elimina ${selectedId}`,
        sha: currentShas.meta,
        token,
      });
    }
    toast(`"${selectedId}" eliminato.`);
    await refreshContentList();
  } catch (error) {
    toast(`Eliminazione fallita: ${error.message}`, true);
  }
}

function handleFileUpload(file) {
  const reader = new FileReader();
  reader.onload = () => {
    pendingImage = { dataUrl: reader.result };
    schedulePreview();
  };
  reader.readAsDataURL(file);
}

// ---------- Wiring ----------

el.authBtn.addEventListener('click', handleAuth);
el.tokenInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') handleAuth();
});
el.logoutBtn.addEventListener('click', handleLogout);

el.contentSelect.addEventListener('change', () => loadContent(el.contentSelect.value));
el.newBtn.addEventListener('click', resetForm);
el.deleteBtn.addEventListener('click', handleDelete);
el.pushBtn.addEventListener('click', handlePush);

el.typeSelect.addEventListener('change', () => {
  if (!selectedId) el.sourceInput.value = DEFAULT_SOURCE_BY_TYPE[el.typeSelect.value] ?? 'content.txt';
  updateContentFieldVisibility();
  schedulePreview();
});

for (const field of [el.contentTextarea, el.titleInput, el.optionsTextarea, el.sourceInput]) {
  field.addEventListener('input', schedulePreview);
}

el.previewFrame.addEventListener('load', () => {
  // Il preview.html annuncia la propria disponibilità con un postMessage,
  // ma un secondo segnale sul load evita una race se il messaggio arriva prima.
  previewReady = true;
  schedulePreview();
});

window.addEventListener('message', (event) => {
  if (event.data === 'preview-ready') {
    previewReady = true;
    schedulePreview();
  }
});

// Upload immagine: creato al volo perché l'HTML statico non lo prevede per
// non complicare il markup quando il tipo non è "image".
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
});
uploadBtn.addEventListener('click', () => fileInput.click());
document.body.append(fileInput);
el.contentTextarea.insertAdjacentElement('afterend', uploadBtn);

el.previewFrame.src = './preview.html';

// ---------- Bootstrap ----------

(async function init() {
  if (await tryResumeSession()) {
    await enterApp();
  } else {
    el.authOverlay.hidden = false;
  }
})();
