# EasyBet — Step 8: Telegram intelligente

Questa versione rende gli alert LIVE meno rumorosi e più affidabili.

## Comportamento

- Il match continua a essere monitorato anche dopo il primo segnale VERDE.
- Viene inviato un solo alert VERDE per partita/strategia (`live_alert_sent`).
- Le normali oscillazioni tra VERDE e GIALLO non generano nuovi messaggi.
- Dopo il VERDE può essere inviato al massimo un solo avviso di deterioramento marcato.
- Il deterioramento scatta se:
  - il segnale passa a ROSSO dopo un precedente stato diverso da ROSSO, oppure
  - lo score scende di almeno 25 punti, partendo da almeno 65 e arrivando a 40 o meno.
- Se il bot è disabilitato per una partita, il monitoraggio continua ma Telegram non invia messaggi.
- Il comando di riarmo dell'alert azzera anche lo stato Telegram intelligente.

## Messaggio VERDE

Il messaggio è volutamente compatto e contiene:

- partita
- minuto
- risultato
- strategia
- score EasyBet 0–100
- xG totale
- tiri in porta totali
- tiri totali

## Nuove colonne DB

- `live_last_score`
- `live_last_notified_at`
- `live_deterioration_alert_sent`

Le colonne vengono create automaticamente all'avvio tramite `db.js`.
