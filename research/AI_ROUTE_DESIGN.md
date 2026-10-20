# PosteFinder — itinerario multi-pacco da Chiedi all'AI (20/10/2026)

## Flusso operativo

Un messaggio tipo «Ho 1 pacco DHL, 1 Bartolini Digital e 1 Amazon: dove posso fare tutto in una o due soste da qui verso casa o palestra?» viene elaborato **localmente** da `src/route-intent.mjs`. Il testo viene suddiviso in singoli pacchi, preservando DHL Express/eCommerce quando esplicitato, BRT Digital/etichetta stampata, numero di pacchi, partenza GPS/Casa/Palestra, destinazione Casa/Palestra e vincolo 1–2 soste. Non serve la chiave Gemini per questa operazione. Altre domande rimangono affidate alla chat esistente.

La schermata `Organizza pacchi` si precompila, senza sostituire il layout originale. I campi non deducibili restano da scegliere: per «DHL» senza sotto-rete non si presume Express; «BRT» senza tipo non si presume Digital; «Amazon» senza altra indicazione non è trattato come un reso universale. L'utente deve confermare le etichette, l'operazione e, per il ritiro, la sede **già assegnata** nell'avviso. Si può cambiare la rete di un reso Amazon con quella effettiva dell'etichetta. I punti con affiliazione sospesa/non verificata e gli Edicolandia BRT Digital non vengono accettati come servizi confermati.

Premendo `Trova subito il giro`, se i pacchi sono validati, si usano soltanto il GPS autorizzato o luoghi salvati con coordinate valide. In caso di GPS non disponibile non si inventa una posizione alternativa. Se il testo richiede «Casa o Palestra», l'utente sceglie la destinazione in un tap. Il limite della ricerca rapida è di norma **due soste**, oppure una se richiesto espressamente. La funzione produce fino a otto candidati, mostra le prime tre opzioni e favorisce il minimo numero di soste, poi il tragitto geometrico totale inclusa la destinazione. Per due sedi mostra anche la loro distanza approssimativa. Il risultato viene restituito anche in chat con pulsante/link Google Maps.

## Percorso su strada (facoltativo)

Di default l'itinerario usa **distanze in linea d'aria**, non chilometri percorribili o ETA. Per una valutazione su strade è disponibile il comando **Ottimizza per tempi stradali (OSRM)**, con spiegazione della condivisione: soltanto a quel clic, l'app trasmette a `router.project-osrm.org` le coordinate GPS, delle soste candidate e della destinazione. Il provider restituisce una matrice di tempi e distanze su rete viaria; PosteFinder ricalcola l'ordine mantenendo la priorità al minor numero di soste e aprendo poi Google Maps per la navigazione effettiva. La matrice non comprende traffico in tempo reale né tempi allo sportello. Se il servizio esterno non funziona o scade, **si mantiene il risultato geometrico**, senza inventare distanze stradali. L'endpoint OSRM è sostituibile come argomento di `rankRoadPlans`; il server demo **non è adatto come SLA di produzione ad alto traffico**: per un servizio permanente prevedere backend con provider autorizzato, quote e privacy policy appropriate.

## Sicurezza, privacy e test

- GPS e luoghi Casa/Palestra **mai** salvati nel repository o trasmessi a Gemini per il calcolo di queste richieste. Sono letti dal bridge locale, con gli stessi controlli di preferenze Firebase già presenti.
- Nessuna classificazione di servizio derivata dal modello. Il router usa solo codici del catalogo con evidenza, data e limitazioni; BRT Digital sconosciuto viene segnalato chiaramente come **candidato da verificare**, non confermato.
- Se non esiste combinazione affidabile in massimo due soste, dichiarare la copertura insufficiente: non proporre punti inesistenti e non superare silenziosamente il limite.
- Test `tests/ai-route.test.mjs`: parsing conversazionale di richieste miste, separazione sottoreti e negoziante/carrier, casi Amazon e QR, limite pacchi e soste, ranking stradale con matrice simulata, origine e destinazione mai codificate.
- I workflow GitHub verificano test e build di anteprima Netlify. **Non effettuare deployment automatico o modifiche a Firebase.**
