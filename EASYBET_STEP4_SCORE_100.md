# EasyBet – Step 4: punteggio segnali 0–100

Lo score EasyBet deriva direttamente dal punteggio pesato del motore unico in `strategie-live.js`.

- 0–100 misura quanto i criteri disponibili della strategia stanno risultando soddisfatti.
- Non è una probabilità di vincita e non sostituisce stato, finestra temporale o gate quota.
- Il valore mostrato nel Live Analyzer è lo stesso `score100` generato dal motore condiviso.
- Il trend 5/10 minuti resta separato: contribuisce alla dicitura Qualità, ma non altera lo score della strategia.
- Le notifiche Telegram LIVE riportano anche `Score EasyBet: XX/100`.

Esempio visuale: `VERDE · 82/100`.
