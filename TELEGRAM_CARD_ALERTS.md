# EasyBet – Telegram Card Alerts

Gli avvisi pre-partita ora vengono inviati come card PNG dinamiche in stile EasyBet.

La card mostra automaticamente:
- minuti mancanti;
- campionato e bandiera;
- casa e trasferta;
- strategia;
- orario della partita;
- bottone `Apri EasyBet` sotto la foto.

## Render
Il progetto usa `sharp` per generare le PNG. `render.yaml` usa già `npm install`, quindi Render installerà automaticamente la dipendenza.

Variabile opzionale:
`PUBLIC_SITE_URL=https://exchange-igc1.onrender.com`

Se non impostata, viene usato `RENDER_EXTERNAL_URL`; in mancanza anche di quello viene usato l'URL EasyBet attuale.
