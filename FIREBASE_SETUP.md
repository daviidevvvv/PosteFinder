# PosteFinder – configurazione Firebase e accesso Google

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
