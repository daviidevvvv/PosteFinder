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

## Correzione mappa Amazon e controllo InPost - 13 ottobre 2026

### Punto rimosso dalla mappa
- **Amazon Hub Locker Veridiana - ex PENNY**, via Matteo Renato Imbriani 344, storico ID app 402: il 13/10/2026 l'utente ha riferito sul posto che l'area e ora un supermercato ARD e il locker non esiste piu. **Pin tolto**, senza ricrearlo sotto altro nome. Anche se una directory esterna continua a mostrarne altri, non equivale a prova attuale di disponibilita nel checkout Amazon.
- La rimozione non cancella le preferenze Firestore e non attribuisce un nuovo servizio al supermercato ARD.

### Segnalazioni ENI / zona Imbriani da verificare
- **Amazon Locker Melezio**: https://moovitapp.com/index/it/mezzi_pubblici-Amazon_Locker_Melezio-Bari-site_262841264-3342 - pagina terza conferma il nome ma non un civico univoco o la disponibilita attuale nel checkout. L'utente segnala un punto in zona ENI. **Non aggiunto come Amazon attivo o compatibile con resi** finche il selettore Amazon non lo conferma.
- **Amazon Counter Eni Cafe**, via Matteo Renato Imbriani 258: https://moovitapp.com/index/it/mezzi_pubblici-Amazon_Counter_Eni_Cafe-Bari-site_262841260-3342 - nome e civico sono riportati in una directory terza; disponibilita e orari di ritiro Amazon **non ricontrollati dal selettore Amazon**.
- **ENI 09033**, via Matteo Renato Imbriani 258, resta nella rete DHL Express gia censita; il nuovo avviso e informativo, senza creare false membership Amazon o InPost.
- **InPost IPLANET (ITBIS111893F)**: https://inpost.it/locker-bisceglie-itbis111893f-via-imbriani , via Imbriani senza civico: gia censito, non va automaticamente sovrapposto al distributore ENI.
- **InPost TOIL (ITBIS108252F)**: https://inpost.it/locker-bisceglie-itbis108252f-via-imbriani , via Imbriani 212: gia censito separatamente. Un impianto ENI e un locker InPost non sono la stessa rete o lo stesso punto per definizione.

### Altri candidati non promossi a punti attivi
- **InPost Ciuffo Wash**, via Mosca: il riferimento online https://inpost.it/locker-bisceglie-itblq149474b-via-mosca rimanda al localizzatore e non offre una conferma puntuale sufficiente con coordinate ingresso aggiornate. Non aggiunto come attivo.

### Limiti di audit
Non e stato disponibile un elenco completo scaricabile/autenticato degli Hub Amazon del checkout nel territorio; la visualizzazione dei punti disponibili puo dipendere dall'ordine e dal tipo di articolo. Non e corretta una dichiarazione che *tutti* gli Amazon Locker siano verificati con i risultati di Google Maps o directory generiche. I punti Amazon legacy rimanenti sono storici e richiedono una successiva verifica diretta. Nessun altro punto e stato rimosso basandosi soltanto su risultati incompleti di ricerca.

## Revisione ufficiale integrata - 13 ottobre 2026

**Stato aggiornato (sostituisce i riferimenti antecedenti a GLS non verificato e Amazon Melezio non confermato):** l'app integra **59 punti operativi distinti** a Bisceglie e **126 appartenenze a reti**: Amazon Locker melezio e il DHL ServicePoint ENI condividono l'area, ma non sono lo stesso sportello. Le rilevazioni sono conservate con provenienza e data:

- Amazon: [40 risultati grezzi, due ricerche da 20](official-amazon-bisceglie-2026-10-13.json) nel selettore https://www.amazon.it/ulp/view, normalizzati a **28 sedi**. Inclusi Melezio ENI PV9033 via Imbriani 258 e MARISTELLA Tamoil, entrambi H24. Veridiana ex PENNY resta rimosso per segnalazione dell'utente; l'autocomplete "peppinay" non prova che il Locker sia selezionabile.
- DHL Finder eCommerce/partner: [30 sedi con codici, servizi e orari settimanali](official-dhl-finder-bisceglie-2026-10-13.json) da https://www.dhl.com/global-en/microsites/ec/dhl-finder.html. Dei 50 risultati nell'area, **30 sono a Bisceglie e 20 fuori comune**. Ci sono **25 PuntoPoste/Fermoposta** e **5 DHL ServicePoint**, sempre distinguendo queste osservazioni dalle sei precedenti DHL Express.
- GLS: [20 GLS Point nel CAP 76011](official-gls-bisceglie-2026-10-13.json) da https://store.gls-italy.com/it/depot/?q=76011, con orari. La pagina non espone civici o ID ufficiali per tutte le sedi e non attesta resi o QR: non inventarli.
- [Mappatura manuale di negozi e alias](official-site-mapping-bisceglie-2026-10-13.json): negozi diversi non vengono unificati soltanto per vicinanza o civico.
- Coordinate solo indicative: [batch A](geocodes-batch-a-20261013.json), [batch B](geocodes-batch-b-20261013.json), [batch C](geocodes-batch-c-20261013.json). OSM/Nominatim serve SOLO a posizionare indicativamente i pin, non a certificare la sede o il servizio. La scheda segnala pin approssimativi; quelli basati soltanto su una posizione proxy vicina non sono proposti automaticamente per spedire.

**Compatibilita:** Amazon conferma il punto per il **ritiro di ordini**, non per qualsiasi reso; seguire il checkout e le opzioni di restituzione del singolo ordine. DHL Finder comprende sia DHL eCommerce sia partner PuntoPoste: la dicitura "Drop-off return with label" indica etichetta **stampata**, non QR senza stampa; la specifica lettera di vettura puo avere ulteriori vincoli. GLS conferma sedi GLS Point, non ogni categoria di reso e QR. Edicolandia **NON accetta BRT Digital**, secondo segnalazione diretta utente; il divieto non si estende a DHL, Poste, Amazon, GLS. I 7 InPost e 10 BRT originari mantengono la data effettiva **12/10/2026** e non risultano artificialmente ricertificati il 13.

**Orari:** per una spedizione si consulta SOLO l'orario della rete scelta, senza richiedere che tutte le reti co-localizzate siano simultaneamente aperte. Le schede generiche indicano "almeno una rete aperta" quando i corrieri differiscono. Non garantisce ferie, saturazione del locker o apertura futura all'arrivo.

**Mappa:** il filtro predefinito presenta sedi con riscontro ufficiale; l'utente puo aprire anche le posizioni storiche non ricontrollate. Copertura **parziale**, non censimento esaustivo. UPS ancora senza risultati locali verificati nel locator ufficiale. InPost Ciuffo Wash rimane da ricontrollare (URL precedente reindirizza al locator generico).

### Correzione di visibilita Amazon Locker Melezio - 14 ottobre 2026

Il vecchio modello aggregava Amazon Locker Melezio come membership della sede fisica **Distributore Eni 09033**. Questo rendeva il locker invisibile alla ricerca per parola «melezio», al filtro «Locker» e all'icona dei locker Amazon, nonostante fosse nei dati ufficiali. Ora la mappatura crea un punto separato **Amazon Locker melezio (ENI PV9033)** con tipo `locker_amazon`, orari 24 ore su 24 e membership Amazon per il ritiro ordini, mantenendo la stazione come punto **DHL Express** autonomo. Le coordinate del locker sono quelle indicative dell'area ENI, con ingresso esatto non verificato; il pin separato sara visibile con lieve scostamento cartografico quando i due punti sono visualizzati insieme. Numero sedi operative: 59; appartenenze totali: 126 (invariate).
