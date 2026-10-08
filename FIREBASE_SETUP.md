# PosteFinder + Firebase — progetto di sviluppo

## Stato attuale (8 ottobre 2026)

- **Web SDK configurato** per Firebase **`postefinder-dev`** nel branch `feature/firebase-foundation`.
- L'interfaccia originale Netlify (mappa a sinistra, barra gialla, elenco a destra), i 31 punti e i filtri sono conservati.
- L'account email/password e la sincronizzazione Firestore sono implementati nel codice, ma richiedono che Authentication e Firestore siano attivati nella **console Firebase**.
- **Non abbiamo ancora verificato un login reale o la sincronizzazione online**.
- La pull request è in bozza. `main` e **https://postefind.netlify.app** non sono stati modificati. Non collegare il progetto di produzione a questo branch finché non hai verificato tutto.

## 1. Attiva Authentication (operazione necessaria nella tua console)

1. Apri **[Authentication del progetto postefinder-dev](https://console.firebase.google.com/project/postefinder-dev/authentication/providers)**.
2. Se richiesto, premi `Inizia`.
3. In `Sign-in method`, abilita **Email/Password**, poi salva.
4. Da Authentication → Settings → Authorized domains, autorizza il **dominio effettivo** del futuro sito Netlify di prova (ad es. `postefinder-preview.netlify.app` se disponibile). Non autorizzare domini generici come `*.netlify.app`.
5. Per le prove in locale, se necessario, aggiungi `localhost`. Non usare ancora il dominio di produzione.

## 2. Attiva Firestore + regole (necessario)

1. Apri **[Cloud Firestore del progetto postefinder-dev](https://console.firebase.google.com/project/postefinder-dev/firestore)**.
2. Se il database `(default)` non esiste, crea **Cloud Firestore → Create database**. Scegli una regione europea e la **modalità Produzione** (nega accessi fino alla pubblicazione delle regole corrette).
3. Nel pannello **Rules**, sostituisci le regole iniziali con il contenuto di [`firestore.rules`](./firestore.rules) e premi **Publish**. Controlla prima che il file faccia riferimento esclusivamente alla tua app.
4. Nelle regole incluse, **solo un utente autenticato può leggere/scrivere i suoi dati privati**. I punti pubblici sono leggibili da tutti, ma scrivibili **solo tramite Firebase Admin SDK**. Nessun utente normale può modificare la lista comune.

Per usare Firebase CLI da una macchina già autenticata:
```bash
firebase login
firebase use postefinder-dev
firebase deploy --only firestore:rules --project postefinder-dev
```

Il file `.firebaserc` punta a questo progetto di **sviluppo**, non a un progetto reale diverso.

## 3. Crea un ambiente Netlify di prova (nessuna modifica alla produzione)

- In Netlify, crea un **nuovo sito**, senza riconfigurare né importare il sito `postefind.netlify.app` già esistente.
- Connetti la repository GitHub `daviidevvvv/PosteFinder`.
- Scegli il branch **`feature/firebase-foundation`** come branch da pubblicare sul **nuovo sito di prova**.
- Tipo: sito statico. Nessun comando build; publish directory: `.` (radice repository).
- Apri l'URL generato e autorizza **solo quel dominio** in Firebase Auth → Authorized domains.
- Se Firebase non parte, apri la console del browser (F12): controlla il download di `firebase-config.js`, `src/firebase-sync.mjs` e i moduli Firebase, poi gli eventuali errori `permission-denied` o `operation-not-allowed`.
- **Non pubblicare il branch di prova nel sito Netlify di produzione e non unire la PR.**

## 4. Test di accettazione

1. Apri il nuovo URL: header giallo, mappa OpenStreetMap a sinistra, elenco a destra, **31 punti**.
2. Verifica ricerca, filtri `Aperti ora`, segnaposto e indicazioni su Google Maps.
3. Apri `Accedi` → `Registrati` e crea **un account di prova**.
4. Imposta `Casa` o `Palestra` cliccando sulla matita, aggiungi un preferito, assegna una valutazione e attendi l'etichetta `Sincronizzato`.
5. Verifica nella console Firestore **`users/{uid}/private/preferences`** il documento con i tuoi dati (non condividere qui indirizzi personali).
6. Da una seconda finestra/dispositivo, accedi con lo stesso account: le preferenze devono comparire.
7. Esci e controlla che Casa/Palestra, eventuali preferiti, coordinate personali e chiave Gemini locale non rimangano visibili sul browser di prova.
8. Se il test fallisce, **non pubblicare** il branch sulla produzione.

## 5. Catalogo dei 31 punti su Firestore (opzionale, passo successivo)

Il sito continua a mostrare i 31 punti inclusi nell'HTML, anche se Firestore è vuoto o non raggiungibile. Quando il database e le regole sono attivi:

```bash
node scripts/seed-firestore.mjs
```

Il comando sopra **non scrive nulla**: controlla il dataset. Per importare davvero serve un amministratore Google Cloud autenticato con le **Application Default Credentials**, Node e la dipendenza `firebase-admin`, esclusivamente sul proprio computer o ambiente sicuro. Quindi:

```bash
npm install
# Dopo l'autenticazione ADC nel tuo ambiente locale
FIREBASE_PROJECT_ID=postefinder-dev node scripts/seed-firestore.mjs --write
```

Per PowerShell impostare `$env:FIREBASE_PROJECT_ID='postefinder-dev'` e poi eseguire `node scripts/seed-firestore.mjs --write`. Non mettere credenziali, token o service-account JSON nel repository e non inviarli in chat. Lo script imposta `verified: false` per ogni punto e **non rimuove documenti esistenti**.

## Sicurezza e limiti attuali

- La `apiKey` Web Firebase è visibile pubblicamente **per progettazione**; verifica in Google Cloud Console che abbia restrizioni API adeguate. **Non** è una chiave di amministrazione.
- La chiave **Gemini** dell'assistente legacy è ancora salvata localmente nel browser: non va confusa con Firebase API key. L'AI server-side va sviluppata in una successiva fase.
- Google Analytics **non è stato inizializzato** malgrado sia incluso un `measurementId`: va trattato separatamente e con una valutazione privacy/consenso.
- I dati `custom_places` restano nel browser per supportare modalità locale; usa un dispositivo personale durante i test.
- Non sono ancora inclusi: notifiche push, dashboard amministrativa, controllo corrieri, verifiche reali degli orari, regole testate con emulatore e backup automatici.
- L'applicazione va collaudata manualmente su browser con accesso reale a Firebase prima di unire la PR.

## Controlli automatici

```bash
node scripts/check-source.mjs
node --check src/firebase-sync.mjs
node --test
node scripts/seed-firestore.mjs
```

I controlli Node verificano sintassi, configurazione e struttura del catalogo; **non provano che Firebase Authentication o Firestore siano stati abilitati nella Console**. Il workflow GitHub Actions li esegue per ogni pull request.
