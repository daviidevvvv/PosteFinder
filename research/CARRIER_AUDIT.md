# PosteFinder: raccolta corrieri e controllo fonti

## Raccolta del 12 ottobre 2026

20 luoghi fisici, 23 appartenenze documentate: 10 BRT, 6 DHL Express, 7 InPost. Edicolandia e Tabaccheria Trentadue sono presenti su BRT e DHL Express; Posta Privata Nexus su BRT e InPost. Sei luoghi corrispondono a ID gia presenti nei 31 punti storici e mantengono quei numeri per conservare preferiti e voti. Quattordici luoghi vengono aggiunti: 45 schede totali, ma solo 20 ricontrollate in questa raccolta.

Copertura locale e parziale per Bisceglie, non un inventario italiano completo. `observedAt` e la data di consultazione, non la data di aggiornamento dichiarata dal corriere (non disponibile). Nessuna promessa di apertura fisica o disponibilita del vano in tempo reale.

## Metodo e fonti

**BRT**: https://www.mybrt.it/it/mybrt/parcel-shops/search, raggiunto da https://www.brt.it/it/brt-fermopoint/. Ricerca Bisceglie, Barletta-Andria-Trani, Italy senza filtro orario. Acquisiti i primi 10 risultati, ID, coordinate, businessHours e codici servizi. Non completata la paginazione geografica; non dichiarata esaustivita. Nove punti confrontati con le pagine fermopoint.it indicate in sourceDetailsUrl. Sono pubblicazioni della stessa rete, non due verifiche indipendenti sul posto. I codici numerici dei servizi restano tali: nessuna interpretazione inventata.

**DHL Express**: https://mydhl.express.dhl/it/it/locator.html. Ricerca Italia/Bisceglie, Ho una spedizione di reso DHL Express, Ho una lettera di vettura DHL. Dieci risultati: sei nel comune, quattro a Trani/Molfetta non inclusi. Recuperate proprieta esplicite prePrintReturnLabel, labelFree, shipmentDropOffAndCollection, orari, cutoff e chiusure festive. Nessuna credenziale del localizzatore conservata o riutilizzata per scraping. Non confondere con DHL eCommerce: https://www.dhl.com/it-it/home/servizio-clienti/servicepoint-finder-dhl-ecommerce-per-i-ritiri-e-linvio-dei-resi-e-commerce.html.

**InPost**: sette pagine ufficiali di dettaglio ricontrollate: Nexus ITPBT03592P, Tabaccheria Via Cavour47 ITPBT07090P, Famila ITBIS24842, Cassetta Petroli ITBIS43460M, IP ITBIS45221M, IPLANET ITBIS111893F, TOIL ITBIS108252F. Coordinate dai link ufficiali Naviga. I tentativi HTTP diretti su alcune pagine erano bloccati: consultazione tramite browser/scraper pubblico, nessun CAPTCHA aggirato. URL puntuali nelle osservazioni. 24/7 indica l'orario dichiarato, non vani liberi in tempo reale.

## Conflitti

| Punto | BRT | Altra fonte | Trattamento |
|---|---|---|---|
| Edicolandia | Lun-sab 07:45-13:00 / 17:00-20:30, dom chiuso | DHL lun-sab 08:00-20:30, dom 08:00-13:00 | Fascia prudenziale comune lun-sab 08:00-13:00 / 17:00-20:30 |
| Trentadue | Lun-sab 05:00-13:00 / 16:00-19:30 | DHL lun-sab 05:30-13:00 / 15:30-20:00 | Fascia comune 05:30-13:00 / 16:00-19:30 |
| Nexus | Pomeriggio 16:00-19:00 | InPost 16:30-19:00 | Fascia comune dal 16:30 |
| Ficus | Civici128-134 | Fermopoint128-130 | Mantenuto conflitto indirizzo |
| Bar Royal | Coordinate BRT | Fermopoint differisce circa170m | Posizione BRT; verificare ingresso |

La fascia comune e una scelta prudenziale dell'algoritmo, non una rettifica certificata degli orari reali. Nessuna telefonata effettuata. Chiusure straordinarie, ferie, festivita non indicate restano ignote. Il cutoff DHL resta separato dalla chiusura.

La segnalazione nel repository del 9 ottobre 2026, Edicolandia BRT solo non digital / digital non disponibile, e conservata. Non viene raccomandato un QR BRT per quel negozio e non si estende tale limite a DHL, che ha evidenza distinta.

## Reti e candidati non ancora verificati

UPS: candidati Via De Gasperi53 e MBE Lamaveta92-94. Non certificati come Access Point; orari delle directory contraddittori. Non confondere Nexus al40 con altro punto al53. GLS: Biblio dichiara il servizio nel sito negozio, ma non certifica tutte le etichette o i resi. DHL eCommerce: non equiparato a Express. Poste/LIS: conservati dati storici, ma LIS pagamenti non significa servizio pacchi. Amazon: identificare il corriere e il metodo nel reso, non usare i locker come punti universali.

InPost Ciuffo Wash ITBLQ149474B: pagina redirige al localizzatore, quindi non aggiunta come attiva (non prova chiusura definitiva). Fatto a Posta: pagina Fermopoint in errore, non certificata come attiva.

## Dati aggiornabili

Sorgente: data/carrier-inputs.json. Osservazioni per rete, ID stabili, coordinate, orari e limitazioni. Il build normalizza dist/data/carrier-catalog.json senza cambiare automaticamente le date. Sono fatti normalizzati, non copie HTML editoriali. Non sono incluse chiavi dei siti o dati personali.

Nessuno scraping periodico nascosto o promessa di sincronizzazione continua. Soglia freschezza configurabile 30 giorni: dopo, nessuna raccomandazione come attualmente verificato. Un importatore successivo deve distinguere errore HTTP, blocco, dato mancante e chiusura reale, conservare l'ultima osservazione e proporre diff revisionabili. Nessuna cancellazione massiva per una risposta vuota. Per completare tutte le reti servono feed/API autorizzati o altri controlli; un endpoint web non e automaticamente una licenza di riuso.

## Calcolo e privacy

Fino a quattro richieste e quattro soste. Rete specifica, operazione e conferma etichetta; per ritiro gia consegnato e obbligatorio il punto assegnato. Priorita al minimo numero di soste, poi alla somma delle distanze geografiche; e un ottimo sul catalogo e sui vincoli considerati, non stradale. Opzione arrivo Casa/altro luogo con deviazione geometrica. Niente sensi unici, traffico, ETA o apertura all'arrivo. Google Maps calcola il tragitto reale al clic; sul mobile controllare il limite delle tappe.

Calcolo locale, nessun costo Gemini o invio di coordinate al modello per questo planner. Il link di navigazione invia origine e destinazioni a Google Maps solo quando aperto. Il resto della chat Gemini resta invariato.

## Distribuzione e verifiche

Build: node scripts/build-carrier-bundle.mjs. Pubblicare dist nel sito Netlify esistente, non la radice del repo. Il build usa l'index.html corrente e conserva le correzioni mobile, Firebase, Google login. Nessun cambiamento a firestore.rules e nessuna nuova regola richiesta.

Test: node --test tests/carrier-planner.test.mjs (28 test per dati, orari, DST, conflitti, etichette, pesi/ingombri forniti, multi-stop e ritorno a casa). Prova locale DOM desktop1366x900 e mobile390x844 con dipendenze di rete simulate:45 schede, filtri10/6/7, unione DHL+BRT, chiarimento DHL ambiguo. Questa simulazione non prova le tile online, Firebase o un accesso utente reale. Il workflow GitHub genera gli archivi, non esegue deploy su Netlify.

## Aggiornamento BRT Digital - 13 ottobre 2026

La Digital Parcel Label BRT e un QR senza stampa, per spedizioni e resi (fonte: https://www.brt.it/it/brt-per-ecommerce/). La pagina BRT descrive il servizio in generale, ma non certifica quali singoli negozi lo accettino.

**Edicolandia**: la segnalazione dell'utente del 9 ottobre 2026 indica mancata accettazione del servizio BRT Digital, pur mantenendo BRT con etichetta stampata. E una segnalazione sul campo e non un attestato di BRT; non implica un divieto per DHL Express.

La UI ora chiede il formato (BRT Digital QR o etichetta cartacea) per spedizioni e resi; il formato QR e predefinito in quanto piu richiesto dall'utente. Edicolandia e esclusa da ogni itinerario BRT Digital e segnalata nella scheda. Gli altri punti senza prova individuale Digital sono solo candidati provvisori, da contattare prima di andare: la scelta di una combinazione non significa abilitazione certificata. Il planner preferisce risultati interamente confermati quando disponibili.

Nessuna data delle osservazioni ufficiali e stata aggiornata artificialmente. Le fonti correnti sono quelle consultate il 12 ottobre 2026. Non sono state effettuate telefonate o conferme BRT Digital per gli altri punti.
