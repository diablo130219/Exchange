# EasyBet — Step 22: pulizia codice legacy

Rimosso il vecchio codice del progetto Taccuino Exchange che non fa più parte di EasyBet.

## Frontend rimossi
- `public/index.html`
- `public/partite.html`
- `public/esiti.html`
- `public/easybet-legacy.html`

Restano:
- `public/easybet.html` — consultazione
- `public/easybet-admin.html` — gestione partite

## Backend
Eliminate le API legacy:
- `/api/casse`
- `/api/bets`
- `/api/settings`

`/api/state` ora restituisce soltanto dati EasyBet:
- matches
- alertSettings
- subscriberCount
- botConfigured

## Database
`db.js` non crea più:
- casse
- bets
- settings

Importante: non viene eseguito alcun `DROP TABLE`.
Se le vecchie tabelle esistono già nel database di produzione, restano intatte ma EasyBet non le usa più.

## Supabase / migrazione
Rimosse casse/bets/settings anche dallo schema Supabase e dallo script di migrazione.

## Metadata progetto
- package name: `easybet`
- descrizione aggiornata a EasyBet

Il nome del servizio in `render.yaml` è stato lasciato invariato intenzionalmente per non rischiare di creare/rinominare il servizio Render o cambiare l'URL esistente.

Nessuna modifica a strategie, Live Analyzer, segnali, Telegram o statistiche.
