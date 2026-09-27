# EasyBet

Pacchetto pulito di produzione.

## Struttura
- `public/` — sito EasyBet + area Admin + asset frontend
- `server.js` — API/server Express
- `db.js` — database Neon/PostgreSQL
- `strategie-live.js` — motore unico strategie
- `scheduler.js` — scheduler notifiche
- `telegram.js` — integrazione Telegram
- `render.yaml` — configurazione Render
- `.env.example` — elenco variabili ambiente
- `package.json` / `package-lock.json` — dipendenze Node

Sono stati rimossi dal pacchetto di produzione:
- vecchi file di documentazione STEP/V2
- immagini demo Telegram non usate dal runtime
- vecchia cartella Supabase
- vecchio script di migrazione a Supabase

Nessun dato del database Neon viene cancellato da questa pulizia.
