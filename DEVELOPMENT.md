# Guida di sviluppo — step finali

Il sistema descritto in [README.md](README.md) è implementato e testato in
locale: build, validazione, viewer, renderer, workflow e test sono completi.

Quello che resta è **portarlo online e collegarlo al device**. Questa guida
copre quegli step nell'ordine in cui vanno affrontati, con il criterio per
considerare ciascuno concluso.

```text
[fatto] implementazione + test locali
   │
   ▼
1. repository Git e primo push
   │
   ▼
2. GitHub Pages attivo e viewer verificato nel browser
   │
   ▼
3. percorso di integrazione TRMNL  ← step a rischio, da verificare per primo
   │
   ▼
4. taratura del rendering sul display reale
   │
   ▼
5. contenuti reali al posto dei placeholder
   │
   ▼
6. (opzionale) skill per agenti e nuovi renderer
```

---

## Stato attuale

| Area | Stato | Verificato con |
| --- | --- | --- |
| Algoritmo di selezione | completo | 8 test in `test/schedule.test.js` |
| Validazione dei contenuti | completo | 11 test in `test/build-schedule.test.js` |
| Generazione `schedule.json` | completo | `npm run build` |
| Viewer + 3 renderer | scritto, **non verificato in un browser reale** | solo syntax check |
| Workflow GitHub Actions | scritto, **mai eseguito** | — |
| Integrazione TRMNL | **non iniziata** | — |

Le tre voci in grassetto sono il lavoro che resta. Nessun test automatico copre
il rendering nel browser: i test verificano la logica pura e il build, non il
DOM.

---

## Step 1 — Repository Git e primo push

La directory **non è ancora un repository Git**: è il prerequisito di tutto il
resto, perché l'intera pipeline è innescata da un push.

```bash
git init -b main
git add .
git commit -m "TRMNL generic display: implementazione iniziale"
gh repo create <nome-repo> --public --source=. --push
```

Il repository può essere privato, ma GitHub Pages su repository privati
richiede un piano a pagamento: se il device deve raggiungere il sito senza
autenticazione, serve **pubblico**.

Verifica che `.gitignore` stia funzionando: `public/schedule.json` è generato
dalla build e non deve comparire nel commit.

```bash
git status --short          # public/schedule.json non deve essere elencato
git ls-files public/        # deve essere vuoto
```

**Concluso quando**: `git log` mostra il commit iniziale sul remoto e
`schedule.json` non è tracciato.

---

## Step 2 — GitHub Pages

1. **Settings → Pages → Source: GitHub Actions**. Senza questo passaggio il
   workflow `deploy.yml` fallisce sullo step `configure-pages`.
2. Il workflow parte al push. Se il primo push è avvenuto prima di aver
   impostato la Source, lancialo a mano: **Actions → Deploy TRMNL display →
   Run workflow** (è previsto `workflow_dispatch`).
3. Apri l'URL pubblicato con la barra di debug:

```text
https://<utente>.github.io/<repo>/?debug=1
```

Cosa controllare, in ordine:

| Controllo | Se fallisce |
| --- | --- |
| La barra in basso mostra `default · markdown · <timestamp>` | La pagina non ha caricato lo schedule: guarda la console per l'URL richiesto. |
| `https://<utente>.github.io/<repo>/schedule.json` risponde 200 | Lo step "Assembla il sito" non ha copiato il file: controlla il log della Action. |
| Il Markdown è renderizzato, non mostrato come testo grezzo | `marked` non è stato caricato dal CDN: cerca in console errori di rete. |
| Nessun 404 nel tab Network | Un `source` non è stato copiato in `_site`, oppure la risoluzione della base URL non funziona (vedi §4 degli scostamenti nel README). |

Poi verifica gli altri due renderer abilitandoli temporaneamente:

```bash
sed -i 's/"enabled": false/"enabled": true/' content/architecture/meta.json
npm run build && npm run serve
```

`architecture` ha `start` 2026-09-09 e priority 5, `top-songs` priority 1: con
entrambi attivi vince `architecture`, che ha lo `start` più recente. Per vedere
l'immagine, abilita `top-songs` e lascia disabilitato il diagramma.

**Concluso quando**: tutti e tre i renderer producono output corretto nel
browser desktop, senza errori in console.

---

## Step 3 — Percorso di integrazione TRMNL

> **Questo è lo step a rischio del progetto e conviene affrontarlo prima di
> investire in contenuti.**

L'architettura assume che il TRMNL renderizzi una pagina web **eseguendone il
JavaScript**: il viewer è client-side, seleziona il contenuto e carica `marked`
o `mermaid` nel browser del device.

Questa assunzione va verificata contro la documentazione TRMNL corrente, perché
la pipeline standard del dispositivo genera l'immagine **lato server** a partire
da dati e da un template, e in quel modello il JavaScript della pagina non
viene eseguito. Se è così, il viewer come scritto non produrrebbe nulla sul
display, pur funzionando perfettamente nel browser.

Non dare per scontato quale sia il caso: **verifica sulla documentazione
ufficiale** quale meccanismo di ingestione supporta il tuo device e firmware,
poi scegli di conseguenza.

### Se il device esegue JavaScript (o passa da un servizio che lo fa)

Nessuna modifica: punta il device all'URL di Pages e passa allo step 4.

### Se il device renderizza solo lato server

Tre opzioni, in ordine di lavoro crescente:

**A. Servizio di screenshot come intermediario.** Il device riceve un'immagine
prodotta da un renderer headless che visita la pagina. Il repository non cambia:
è la soluzione meno invasiva e mantiene il viewer così com'è.

**B. Pre-rendering nella build.** La Action, oltre a `schedule.json`, genera con
un browser headless un PNG 800×480 per ogni contenuto, e il device scarica
l'immagine già pronta.

- Costo: aggiunge una dipendenza headless (Playwright o Puppeteer) al workflow.
- Limite importante: le finestre temporali non si attiverebbero più da sole,
  perché l'immagine è statica. Servirebbe una Action `schedule:` (cron) che
  ripubblica periodicamente, oppure un `index.html` che sceglie tra le immagini
  pre-renderizzate — reintroducendo il problema del JavaScript.

**C. Adattare i contenuti al template lato server.** Il più fedele al device e
il più distante da questa architettura: significa riscrivere i renderer nel
linguaggio di template del dispositivo e rinunciare a Mermaid.

**Raccomandazione**: verifica prima, e se serve un intermediario scegli **A**.
Mantiene intatto il modello "un push aggiunge un contenuto" e non tocca il
codice già testato. Riserva **B** al caso in cui non sia praticabile un
servizio esterno.

**Concluso quando**: il display mostra il contenuto `default`, qualunque sia il
percorso scelto.

### Frequenza di aggiornamento

Il TRMNL è un dispositivo a batteria e interroga il server a intervalli, non in
continuo. Due implicazioni da tenere presenti nel pianificare i contenuti:

- la granularità utile di `start`/`end` è l'intervallo di refresh del device,
  non il minuto: finestre più corte di quell'intervallo possono non essere mai
  visualizzate;
- il ricontrollo interno del viewer (60 s) serve solo se la pagina resta aperta
  a lungo, come in un browser. Sul device il refresh è quello del firmware.

Misura l'intervallo reale del tuo device prima di programmare contenuti di breve
durata.

---

## Step 4 — Taratura del rendering sul display reale

Il CSS è tarato su 800×480 a 1 bit ma **non è mai stato visto su e-ink**. La
resa reale differisce dal browser in modi che contano:

- il dithering rende illeggibili i grigi: verifica che nulla nei contenuti li
  usi, immagini fotografiche incluse;
- i testi sotto ~16px possono impastarsi;
- `mermaid` con tema `neutral` produce riempimenti chiari che su 1 bit possono
  diventare bianchi o neri pieni: da controllare su un diagramma reale, non solo
  sull'esempio;
- non c'è scroll: il contenuto eccedente viene **tagliato**, non compresso.

Procedura: metti a display un contenuto di prova per ciascun renderer, fotografa
lo schermo, correggi [style.css](style.css) e ripubblica. Le variabili da
ritoccare sono in cima al file (`--padding`, dimensioni dei font di
`.render-markdown`).

Se emerge che i contenuti Markdown eccedono spesso l'altezza, l'aggiunta utile è
un campo `options` in `meta.json` — già propagato nello schedule dal build, ma
non ancora letto da nessun renderer — per esempio `{"fontSize": "16px"}`.

**Concluso quando**: i tre renderer sono leggibili sul display e hai un
contenuto di riferimento per ciascuno.

---

## Step 5 — Contenuti reali

1. Sostituisci `content/top-songs/artwork.png`, che è un placeholder generato,
   con un'immagine reale — preferibilmente già 1-bit o ad alto contrasto,
   dimensionata per 800×480.
2. Riscrivi `content/default/content.md`: è ciò che il display mostra la maggior
   parte del tempo, ed è anche il fallback in caso di errore. Meno testo
   possibile.
3. Rimuovi o riadatta `content/morning-report`, il cui `start` è cablato al
   2026-09-10 e che quindi scade.
4. Riporta a `enabled: false`, o rimuovi, gli esempi che non servono più.

**Concluso quando**: nessun contenuto in `content/` è un placeholder.

---

## Step 6 — Estensioni opzionali

Da affrontare solo dopo che il flusso end-to-end funziona.

### Skill per agenti

La compatibilità è già garantita dal formato: creare una directory, due file,
commit e push. Quello che manca perché un agente lo faccia in autonomia è un
documento che dichiari **le regole**, e sono già tutte esplicitate nella sezione
"Vincoli di validazione" del README:

- `id` deve coincidere col nome della directory;
- date ISO 8601 con timezone obbligatorio;
- `type` limitato ai renderer esistenti;
- il contenuto deve stare in una schermata.

L'unico lavoro reale è impacchettarle nel formato richiesto dalla piattaforma
dell'agente. Prima di farlo, verifica su un caso pratico che `validate.yml`
intercetti un contenuto malformato prodotto da un agente: è quella la rete di
sicurezza.

### Nuovi renderer

Grazie al caricamento per convenzione basta creare `src/renderers/<type>.js`
con una `render({ item, sourceUrl, container })`. Candidati sensati:

| Type | Note |
| --- | --- |
| `html` | Il più semplice: inserisce il file in un contenitore. Attenzione a cosa viene pubblicato, perché il contenuto finisce nel DOM del viewer. |
| `chart` | Richiede una libreria di grafici configurata in monocromia; su 1 bit servono pattern, non colori. |
| `text` | Testo preformattato, senza dipendenze da CDN: utile come fallback se il CDN è inaffidabile sul device. |

Per ogni nuovo renderer aggiungi un content package di esempio: il build
verifica il type e i test verificano che il type diventi valido.

### Robustezza

Miglioramenti utili solo se i problemi si presentano davvero:

- **CDN non raggiungibile dal device**: `marked` e `mermaid` arrivano da
  jsdelivr. Se il device ha rete limitata, le librerie vanno incluse nel
  repository e servite da Pages.
- **Ripubblicazione a scadenza**: una Action con `schedule:` (cron) che rilancia
  il deploy fa scadere le finestre temporali anche senza push. Serve solo nel
  caso di pre-rendering (opzione B dello step 3); con il viewer client-side è
  superfluo.

---

## Comandi di riferimento

```bash
npm run build     # valida i contenuti e genera public/schedule.json
npm test          # 19 test: selezione + validazione
npm run serve     # http://localhost:8080/?debug=1
```

La build **fallisce di proposito** su un contenuto non valido, e la Action si
ferma prima di pubblicare: la versione precedente resta online. Prima di ogni
push, `npm run build && npm test` riproduce esattamente i controlli della
pipeline.
