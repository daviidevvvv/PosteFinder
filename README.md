# PosteFinder - Punti Poste & LIS Bisceglie

Repository del progetto **Punti Poste & LIS**, per trovare punti di spedizione, ritiro e restituzione pacchi a Bisceglie e dintorni.

## Stato del progetto

Questa è una **copia recuperata dell'export Netlify del 5 ottobre 2026** (`index.html`). Non è ancora il codice sorgente della versione successiva realizzata con ChatGPT Sites: il progetto Sites pubblicato va confrontato separatamente.

- **Stack attuale:** pagina HTML con JavaScript e CSS inline, Leaflet/OpenStreetMap, Tailwind CSS via CDN e Phosphor Icons.
- **Funzioni presenti:** punti Poste/PuntoLis e locker, mappa, geolocalizzazione, filtri, orari, distanze, preferiti, valutazioni, punti nascosti e luoghi personalizzati.
- **Storage attuale:** `localStorage` del browser; i dati non sono sincronizzati tra dispositivi.
- **Assistente AI:** API Gemini chiamata dal browser, con chiave fornita dall'utente. Non inserire chiavi API nel repository. Per una versione condivisa, valutare una chiamata server-side.

## Esecuzione locale

Con Internet attivo, aprire `index.html` nel browser. Preferibilmente avviare un server HTTP locale dalla cartella del progetto:

```bash
python3 -m http.server 8000
```

Poi aprire `http://localhost:8000`.

## Sicurezza

Sono stati eliminati dalla copia pubblica gli indirizzi e le coordinate personali preimpostati per Casa e Palestra. Per configurare questi luoghi, utilizzare l'interfaccia dell'app. Non salvare nel repository indirizzi privati, chiavi, password o esportazioni del `localStorage`.

## Da fare

1. Confrontare questa copia con il sorgente della versione ChatGPT Sites, se disponibile.
2. Migrare impostazioni e preferenze da `localStorage` a un backend autenticato, ad esempio Firebase, con regole corrette.
3. Verificare i punti realmente disponibili e i corrieri supportati; distinguere dati verificati e non verificati.
4. Aggiungere test e workflow di deploy riproducibili.

**Nota:** questo repository non aggiorna automaticamente il sito ChatGPT Sites già pubblicato.
