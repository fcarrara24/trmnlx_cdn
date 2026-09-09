# TRMNL Generic Display

## Obiettivo

Creare un sistema Git-backed per programmare e visualizzare contenuti su un display TRMNL tramite GitHub Pages.

Il sistema deve consentire di aggiungere contenuti semplicemente effettuando un push nella repository.

I tipi di contenuto inizialmente supportati sono:

* immagini
* Markdown
* diagrammi Mermaid

L'architettura deve essere facilmente estendibile ad altri tipi di contenuto.

Per lo stato di avanzamento e gli step che restano da completare, vedi
[DEVELOPMENT.md](DEVELOPMENT.md).

---

# Architettura generale

```text
Content author / AI Agent
        │
        │ push
        ▼
GitHub Repository
        │
        ▼
GitHub Action
        │
        ├── scansione contenuti
        ├── validazione metadata
        └── generazione schedule.json
        │
        ▼
GitHub Pages
        │
        ▼
Generic Viewer
        │
        ▼
TRMNL
```

---

# Struttura repository

```text
/
├── content/
│   ├── default/            # fallback obbligatorio
│   │   ├── meta.json
│   │   └── content.md
│   ├── morning-report/
│   │   ├── meta.json
│   │   └── content.md
│   ├── architecture/
│   │   ├── meta.json
│   │   └── diagram.mmd
│   └── top-songs/
│       ├── meta.json
│       └── artwork.png
│
├── src/
│   ├── viewer.js           # core: seleziona il contenuto attivo e delega
│   ├── renderers/
│   │   ├── index.js        # caricamento per convenzione
│   │   ├── image.js
│   │   ├── markdown.js
│   │   └── mermaid.js
│   └── utils/
│       ├── schedule.js     # algoritmo di selezione (puro, testato)
│       └── fetch.js
│
├── public/
│   └── schedule.json       # generato dalla build, non committato
│
├── scripts/
│   ├── build-schedule.js   # scansione + validazione + generazione
│   └── serve.js            # dev server locale
│
├── test/
│   ├── schedule.test.js
│   └── build-schedule.test.js
│
├── .github/workflows/
│   ├── deploy.yml          # build + deploy su GitHub Pages
│   └── validate.yml        # validazione sulle pull request
│
├── index.html
├── style.css
├── package.json
│
└── README.md
```

---

# Content Package

Ogni contenuto è rappresentato da una directory.

Esempio:

```text
content/
└── morning-report/
    ├── meta.json
    └── content.md
```

Il file `meta.json` contiene le informazioni necessarie alla pianificazione e al rendering.

Esempio:

```json
{
  "id": "morning-report",
  "type": "markdown",
  "source": "content.md",
  "start": "2026-09-10T08:00:00+02:00",
  "end": "2026-09-10T12:00:00+02:00",
  "priority": 10,
  "enabled": true
}
```

Campi:

* `id`: identificatore univoco
* `type`: tipo di contenuto
* `source`: file principale del contenuto
* `start`: data e ora di inizio visualizzazione
* `end`: data e ora di fine opzionale
* `priority`: priorità in caso di sovrapposizione
* `enabled`: abilita/disabilita il contenuto

Tutte le date devono essere in formato ISO 8601 con timezone esplicito.

---

# Tipi iniziali

## image

```json
{
  "type": "image",
  "source": "image.png"
}
```

Il viewer visualizza l'immagine adattandola allo schermo mantenendo le proporzioni.

---

## markdown

```json
{
  "type": "markdown",
  "source": "content.md"
}
```

Il viewer scarica il file e lo renderizza come HTML.

---

## mermaid

```json
{
  "type": "mermaid",
  "source": "diagram.mmd"
}
```

Il viewer carica il diagramma Mermaid e lo renderizza nel browser.

---

# Schedule

Il file generato automaticamente è:

```text
schedule.json
```

Esempio:

```json
{
  "generatedAt": "2026-09-09T20:00:00Z",
  "items": [
    {
      "id": "default",
      "type": "markdown",
      "source": "/content/default/content.md",
      "start": "2000-01-01T00:00:00+00:00",
      "priority": 0
    },
    {
      "id": "morning-report",
      "type": "markdown",
      "source": "/content/morning-report/content.md",
      "start": "2026-09-10T08:00:00+02:00",
      "end": "2026-09-10T12:00:00+02:00",
      "priority": 10
    }
  ]
}
```

Il file deve essere generato automaticamente ad ogni push che modifica:

```text
/content/**
```

---

# Algoritmo di selezione

Dato l'orario corrente `now`:

1. Caricare `schedule.json`
2. Selezionare tutti gli item con:

```text
enabled = true
AND
start <= now
AND
(end non presente OR end > now)
```

3. Ordinare i risultati per:

```text
start DESC
priority DESC
```

4. Visualizzare il primo risultato.

In assenza di contenuti validi, visualizzare il contenuto `default`.

---

# Generic Viewer

Il viewer è ospitato su GitHub Pages.

Flusso:

```text
load page
    ↓
fetch schedule.json
    ↓
determine current datetime
    ↓
select active content
    ↓
fetch content source
    ↓
select renderer by type
    ↓
render
```

Il viewer deve essere indipendente dal contenuto specifico.

Il core del sistema non deve contenere logica relativa a:

* musica
* agenda
* immagini specifiche
* dashboard specifiche

Deve esclusivamente:

```text
determinare quale contenuto è attivo
+
renderizzarlo tramite il renderer corretto
```

---

# GitHub Action

La GitHub Action deve:

1. attivarsi quando vengono modificati file in `/content`
2. scansionare tutte le directory dei contenuti
3. leggere ogni `meta.json`
4. validare:

   * id unico
   * type supportato
   * start valido
   * end valido se presente
   * source esistente
5. generare `schedule.json`
6. pubblicare la versione aggiornata tramite GitHub Pages

La pipeline deve evitare loop di commit automatici.

Preferibilmente il file generato deve essere prodotto durante la build/deploy invece di creare commit ricorsivi.

---

# Estensibilità

I renderer sono caricati per convenzione: il `type` di un contenuto viene
risolto sul modulo `src/renderers/<type>.js`. Il core non contiene un elenco di
tipi e `scripts/build-schedule.js` deduce i tipi validi dai file presenti nella
directory.

Aggiungere un tipo di contenuto richiede un solo passo: creare il file.

```text
renderers/
├── image.js
├── markdown.js
├── mermaid.js
├── html.js     ← nuovo type "html", subito utilizzabile
└── chart.js    ← nuovo type "chart", subito utilizzabile
```

Ogni renderer espone:

```js
export async function render({ item, sourceUrl, container }) {
  // item      → metadata del contenuto (meta.json normalizzato)
  // sourceUrl → URL assoluto del file sorgente
  // container → elemento DOM in cui inserire il risultato
}
```

Il renderer deve popolare `container` (tipicamente con `replaceChildren`) e
risolvere la promise solo quando il contenuto è effettivamente visibile: il
viewer usa quel segnale per confermare il render o ricadere sul `default`.

---

# Compatibilità futura con ChatGPT Skill

Il formato deve essere semplice da manipolare tramite un agente.

Per aggiungere un contenuto, l'agente deve poter:

1. creare una directory in `/content`
2. aggiungere il file contenuto
3. creare `meta.json`
4. effettuare il commit e push

Esempio:

```text
/content/
└── meeting-reminder/
    ├── meta.json
    └── content.md
```

Non devono essere necessarie modifiche manuali a:

```text
schedule.json
viewer.js
index.html
```

Il sistema di build deve aggiornare automaticamente l'indice dei contenuti.

---

# Uso

## Sviluppo locale

```bash
npm run build     # valida i contenuti e genera public/schedule.json
npm run serve     # http://localhost:8080
npm test          # test di selezione e di validazione
```

Il viewer in debug mostra una barra di stato con id, type e `generatedAt`:

```text
http://localhost:8080/?debug=1
```

## Pubblicazione

1. In **Settings → Pages** impostare *Source: GitHub Actions*.
2. Push su `main`.

La Action valida i contenuti, genera `schedule.json` e pubblica il sito. Il file
generato viaggia nell'artifact di Pages e non viene mai committato: non esiste
alcun loop di commit automatici.

Se la validazione fallisce il deploy si interrompe e la versione precedente
resta online.

## Configurazione del TRMNL

Puntare il device all'URL di GitHub Pages del repository:

```text
https://<utente>.github.io/<repo>/
```

Il viewer rivaluta lo schedule ogni 60 secondi e al ritorno in primo piano,
quindi le finestre temporali diventano attive senza un nuovo deploy.

---

# Aggiungere un contenuto

```bash
mkdir -p content/meeting-reminder
cat > content/meeting-reminder/content.md <<'MD'
# Riunione alle 15:00
Sala grande, ordine del giorno in allegato.
MD
cat > content/meeting-reminder/meta.json <<'JSON'
{
  "id": "meeting-reminder",
  "type": "markdown",
  "source": "content.md",
  "start": "2026-09-10T14:30:00+02:00",
  "end": "2026-09-10T15:00:00+02:00",
  "priority": 20,
  "enabled": true
}
JSON
git add content/meeting-reminder && git commit -m "Aggiunge meeting reminder" && git push
```

Nessuna modifica manuale a `schedule.json`, `viewer.js` o `index.html`.

## Vincoli di validazione

Il build fallisce, con messaggio esplicito, se:

* manca `meta.json` o non è JSON valido
* manca uno dei campi obbligatori `id`, `type`, `source`
* `id` non coincide col nome della directory, o è duplicato
* `type` non ha un renderer corrispondente
* `source` non esiste, o esce dalla directory del contenuto
* `start`/`end` non sono ISO 8601 **con timezone esplicito**
* `end` non è successivo a `start`
* manca il contenuto `default`

`enabled: false` esclude un contenuto dallo schedule senza cancellarlo: resta
comunque validato.

---

# Note di rendering

Il target è un e-ink 800×480 a 1 bit: lo stile è nero su bianco, senza grigi,
ombre o antialiasing. I contenuti vanno dimensionati per stare in una schermata,
perché il display non scorre — il viewer non introduce scrollbar e taglia
l'eccedenza.

`marked` e `mermaid` sono caricati da CDN come ES module solo quando serve: il
tipo `image` non scarica alcuna libreria.

---

# Scostamenti dalla specifica iniziale

Questa sezione elenca le differenze tra la specifica originale di questo
documento e l'implementazione, con la motivazione di ciascuna.

## 1. Renderer caricati per convenzione invece che da un registry

**Specifica**: "il sistema deve permettere di aggiungere nuovi renderer senza
modificare il core", con un elenco di file in `renderers/`.

**Implementazione**: il `type` è risolto dinamicamente su
`src/renderers/<type>.js` e `build-schedule.js` deduce i tipi validi leggendo la
directory. Un registry statico avrebbe richiesto due modifiche al core per ogni
nuovo tipo (la mappa dei renderer e la lista dei type validi nel build), il che
contraddiceva il requisito. Coperto da un test dedicato in
`test/build-schedule.test.js`.

## 2. Fallback di rendering sul contenuto `default`

**Specifica**: il fallback su `default` è previsto solo "in assenza di contenuti
validi", cioè quando nessun item è attivo.

**Implementazione**: il fallback scatta anche quando il render dell'item
selezionato **fallisce a runtime** (source non raggiungibile, Markdown o Mermaid
non valido, CDN non disponibile). Su un device che si limita a mostrare una
pagina, uno schermo bianco è indistinguibile da un guasto hardware.

Analogamente, se `schedule.json` non è raggiungibile ma un contenuto è già a
schermo, il viewer lo mantiene invece di svuotare il display.

## 3. Ricontrollo periodico dello schedule

**Specifica**: il flusso del viewer descrive un singolo passaggio, dal caricamento
pagina al render.

**Implementazione**: il viewer rivaluta lo schedule ogni 60 secondi e al ritorno
in primo piano, ri-renderizzando solo se l'item selezionato è cambiato. Senza
questo, una finestra temporale (`start`/`end`) diventerebbe attiva solo al
successivo reload del device o a un nuovo deploy, rendendo la pianificazione
inaffidabile.

## 4. `source` risolto contro la base URL, non contro la root del dominio

**Specifica**: `schedule.json` contiene percorsi assoluti come
`/content/default/content.md`.

**Implementazione**: il formato dello schedule è invariato, ma il viewer risolve
quei percorsi contro il proprio `document.baseURI`. Su un *project site* GitHub
Pages il sito è pubblicato in `https://<utente>.github.io/<repo>/`, dove un
percorso assoluto punterebbe fuori dal repository e restituirebbe 404.

## 5. `start` opzionale

**Specifica**: `start` è elencato tra i campi di `meta.json`.

**Implementazione**: se omesso vale `2000-01-01T00:00:00+00:00`, cioè "sempre
attivo" — la stessa convenzione già usata dall'esempio del contenuto `default`
nella sezione Schedule. Restano obbligatori `id`, `type` e `source`.

## 6. Validazioni aggiuntive

Oltre a quelle richieste (id unico, type supportato, date valide, source
esistente) il build verifica anche che:

* `id` coincida col nome della directory — un disallineamento rende il contenuto
  impossibile da ritrovare a partire dallo schedule;
* `source` non contenga `..` e non sia assoluto — evita che un content package
  faccia riferimento a file esterni alla propria directory;
* `start`/`end` abbiano un timezone esplicito — la specifica lo richiede a
  parole, qui è imposto dal validatore;
* `end` sia successivo a `start`;
* il contenuto `default` esista — senza di esso il fallback del viewer non ha
  nulla da mostrare.

## 7. File non previsti dalla specifica

| File | Motivo |
| --- | --- |
| `src/utils/fetch.js` | Fetch con `cache: no-store` condiviso da viewer e renderer: il device ricarica la pagina periodicamente e deve vedere i contenuti aggiornati. |
| `scripts/serve.js` | Dev server locale che riproduce il layout pubblicato (`/schedule.json` mappato su `public/schedule.json`), per verificare il rendering prima del push. |
| `test/*.test.js` | 19 test su `node:test`, senza dipendenze: algoritmo di selezione e casi di validazione. |
| `.github/workflows/validate.yml` | Valida i contenuti sulle pull request senza pubblicare. |
| `package.json` | Script `build`, `test`, `serve`. Nessuna dipendenza npm. |

## 8. Stato dei contenuti di esempio

`content/architecture` e `content/top-songs` sono `enabled: false`, così lo
schedule iniziale mostra il `default`; restano validati e servono da esempio per
i type `mermaid` e `image`. `content/top-songs/artwork.png` è un placeholder
monocromatico generato, non un artwork reale.
