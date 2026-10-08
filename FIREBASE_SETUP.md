# PosteFinder – configurazione Firebase e accesso Google

## Gemini 3.8 Flash + chiave sincronizzata con Firestore (ottobre 2026)

**Modello del chatbot:** `gemini-3.8-flash` (stabile), con `thinkingLevel: low`.
La chiave utente è salvata nel documento separato `users/{uid}/private/geminiKey`, mai nel catalogo pubblico, e sincronizzata quando si effettua l'accesso con Firebase Authentication. Quando il documento non esiste, la chiave già presente nel browser viene migrata automaticamente alla prima connessione dell'account (solo dopo la pubblicazione delle regole qui sotto). Sui dispositivi successivi l'utente può usare la stessa chiave senza reinserirla.

### Azione obbligatoria una tantum: aggiornare le regole di sicurezza Firestore

1. Apri [Firestore → Regole (postefinder-dev)](https://console.firebase.google.com/project/postefinder-dev/firestore/rules).
2. Copia **l'intero** file aggiornato [firestore.rules](./firestore.rules) e premi **Pubblica**. La versione precedente non permetteva il nuovo documento `geminiKey`.
3. Attendi qualche minuto per la propagazione, poi riapri il sito e accedi con Google.
4. Usa l'ingranaggio nella finestra dell'Assistente per inserire o modificare la chiave; in presenza di login e regole valide viene scritta in Firestore. Il sito può usare la chiave già salvata nel browser alla prima migrazione.

**Attenzione:** Firestore sincronizza la chiave **in chiaro** su un documento protetto dalle Security Rules, leggibile soltanto dal suo proprietario autenticato. Questo non equivale a una credenziale custodita sul server: il browser dell'utente può leggerla e la utilizza per chiamare Google. Non è adatto a un servizio pubblico con una chiave condivisa dall'amministratore. Mantieni la chiave limitata al progetto/API necessari, imposta avvisi e quote di spesa e non condividere l'account. Per un futuro servizio multiutente è raccomandato spostare le chiamate su Netlify Functions con segreto in variabile d'ambiente e protezione anti-abuso.

### Distribuzione sul dominio esistente

Il codice aggiornato è in GitHub; un deploy Netlify **non parte automaticamente** se hai scelto il caricamento manuale.
Scarica lo ZIP `postefinder-netlify-preview` dal workflow verde GitHub Actions più recente, estrailo e carica **la cartella** nel sito Netlify *esistente* `postefind` → **Deploys**, non dalla schermata Netlify Drop generale.
Il pacchetto include il sito `index.html`, `firebase-config.js`, `src/firebase-sync.mjs` e `src/state-schema.mjs`. Non serve creare un altro dominio.

### Problemi più comuni

- **"Errore tecnico" sul vecchio Gemini:** il modello era `gemini-2.5-flash-preview-09-2025`. La nuova versione usa `gemini-3.8-flash` e mostra errori specifici.
- **HTTP 403 in Firestore:** verifica di aver pubblicato la nuova regola `match /users/{uid}/private/geminiKey` e di essere autenticato.
- **HTTP 403 in Gemini:** controlla abilitazione Gemini API, restrizioni della chiave e accesso al modello; il messaggio nella chat è specifico.
- **HTTP 429:** limite o quota API esauriti. La richiesta di API può avere costi sul tuo progetto Google.
- **Nuovo dispositivo chiede ancora la chiave:** attendi l'etichetta `Sincronizzato · Esci`; la chiave deve essere già stata salvata nel documento Firestore. Dopo aver pubblicato le regole, ricarica la pagina sul dispositivo che possiede la chiave per effettuarne la migrazione.
- **Logout:** cancella la chiave dal browser; il documento remoto rimane associato al tuo UID.
- **Non caricare mai la chiave Gemini nel repository GitHub, in un file statico JavaScript o in una schermata pubblica.**

---

## Stato attuale

- Il sito pubblico è **https://postefind.netlify.app** (Netlify, deploy manuale).
- Il repository sorgente è **https://github.com/daviidevvvv/PosteFinder**.
- Il progetto Firebase utilizzato dal sito si chiama **`postefinder-dev`**.
- La grafica originale Netlify (testata gialla, mappa Leaflet a sinistra, sidebar a destra) è mantenuta; le 31 sedi originali sono presenti nel file `index.html`.
- Authentication supporta email/password e **Continua con Google**.
- Le preferenze private sono sincronizzate in Firestore, alla posizione `users/{uid}/private/preferences`.

## Attivare Accedi con Google (obbligatorio)

1. Apri [Firebase Authentication – provider](https://console.firebase.google.com/project/postefinder-dev/authentication/providers).
2. Nella scheda **Metodo di accesso** apri **Google**, attiva **Abilita**, scegli l'**email di supporto del progetto** e premi **Salva**.
3. Apri [Authentication – Impostazioni](https://console.firebase.google.com/project/postefinder-dev/authentication/settings) → **Domini autorizzati** e controlla che sia presente **`postefind.netlify.app`**, senza `https://` né `/`.
4. Queste impostazioni sono configurazioni Firebase lato server: **non** si attivano semplicemente caricando il codice su Netlify.

**Importante:** l'accesso Google usa il popup Firebase `GoogleAuthProvider` e `signInWithPopup`; autorizza il popup se il browser lo blocca. Non richiede una chiave Google OAuth scritta manualmente nell'app.

## Pubblicare sullo stesso sito Netlify (senza crearne uno nuovo)

1. Apri la pagina [GitHub Actions](https://github.com/daviidevvvv/PosteFinder/actions), seleziona il workflow verde più recente **Verify PosteFinder**.
2. Scarica l'archivio **postefinder-netlify-preview** dalla sezione **Artifacts**.
3. Estrai lo ZIP. Deve contenere `index.html`, `firebase-config.js`, `src/firebase-sync.mjs` e `src/state-schema.mjs`.
4. Entra nel tuo sito **postefind** su Netlify → **Deploys** → area di caricamento manuale; trascina **la cartella estratta** nello stesso sito. **Non** usare Netlify Drop dalla schermata generale: può creare un sito separato.
5. Aggiorna **https://postefind.netlify.app** con Ctrl+F5. La pagina deve mostrare mappa e punti, e la finestra Account deve mostrare anche **Continua con Google**.

Il codice GitHub da solo **non** aggiorna automaticamente il sito se Netlify non è collegato al repository per il deploy automatico.

## Test Google e conservazione dati

1. Premi **Accedi** → **Continua con Google**; seleziona un account Google.
2. Il pulsante nella testata dovrebbe diventare **Sincronizzato · Esci** quando Firestore ha letto o creato il documento dell'utente.
3. Salva un preferito, un voto o Casa/Palestra; esci e accedi da un altro browser con **lo stesso account Google**; i dati dovrebbero comparire.
4. Se questa email aveva già un account PosteFinder registrato con password, l'app potrebbe chiederti di accedere prima con la stessa email/password per **collegare Google allo stesso UID**, anziché creare un account separato.
5. Per confermare le regole Firestore, prova a leggere le preferenze di un utente diverso: l'accesso deve essere negato.
6. Se fallisce la connessione Google: verifica prima che il provider **Google** sia abilitato, che il dominio sia autorizzato e che le finestre popup siano consentite.

## Sicurezza e funzionalità non ancora implementate

- Le regole Firestore in `firestore.rules` danno accesso ai dati privati solo all'UID proprietario; la collezione `locations` è leggibile pubblicamente e modificabile solo con Admin SDK.
- La configurazione Firebase Web `apiKey` è un identificatore pubblico. Le credenziali di account di servizio, le password e le chiavi AI non devono finire su GitHub.
- I 31 punti sono già nel codice, ma l'importazione del catalogo in Firestore non è ancora avvenuta (si usa il catalogo statico come fallback).
- La disponibilità dei corrieri e gli orari non sono certificati automaticamente.
- Push notification, pannello moderazione e chiamate Gemini via backend non sono ancora implementati.
- Google Analytics non viene inizializzato.

## Controlli automatici

```bash
node scripts/check-source.mjs
node --check src/firebase-sync.mjs
node --test
node scripts/seed-firestore.mjs
```

GitHub Actions esegue questi controlli senza effettuare deploy su Netlify né modificare Firestore. La verifica reale del popup Google richiede una prova browser e l'attivazione del provider.
