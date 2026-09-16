# Guida al Rilascio — Pipeline di Deploy

Il sistema utilizza GitHub Actions per automatizzare la validazione, la generazione degli asset e la pubblicazione su GitHub Pages.

## Configurazione della Pipeline

La pipeline è definita in `.github/workflows/deploy.yml` e viene attivata automaticamente su ogni `push` al branch `main` che modifica file rilevanti (contenuti, script di build, o configurazione della pipeline stessa).

### Secrets necessari

Per il corretto funzionamento, assicurati che il repository sia configurato correttamente su GitHub:

1. **GitHub Pages**:
   - Vai in `Settings` → `Pages`.
   - Imposta **Build and deployment** → **Source** su `GitHub Actions`.

2. **Secrets (Opzionale)**:
   - Se utilizzi servizi esterni che richiedono autenticazione durante la build (es. API key per agenti o altri servizi), aggiungili in `Settings` → `Secrets and variables` → `Actions`.
   - Nella pipeline, puoi accedere a questi secret aggiungendo la direttiva `env` al job di build:
     ```yaml
     env:
       API_KEY: ${{ secrets.MY_SECRET_KEY }}
     ```

## Procedura di Rilascio

Il rilascio è **continuo**: non è necessario un comando specifico per "rilasciare". Il processo segue il flusso di lavoro Git-backed:

1. **Modifica/Aggiunta contenuti**: Modifica i file nella directory `content/` (file `.md`, `.mmd`, `meta.json` o immagini).
2. **Validazione Locale (Consigliato)**: Prima del push, esegui localmente il test per verificare che la build passi:
   ```bash
   npm run build
   npm test
   ```
3. **Commit e Push**:
   ```bash
   git add .
   git commit -m "Aggiunto/Modificato contenuto <id>"
   git push origin main
   ```
4. **Deploy Automatico**: GitHub Actions rileverà il push, eseguirà la validazione, genererà `schedule.json` e `trmnl.json`, e aggiornerà automaticamente il sito pubblicato su GitHub Pages.

---
## Monitoraggio
Puoi monitorare lo stato del deploy dalla tab **Actions** nel tuo repository GitHub. Se la pipeline fallisce, il sito pubblicato **non viene aggiornato** e rimane attiva l'ultima versione funzionante.
