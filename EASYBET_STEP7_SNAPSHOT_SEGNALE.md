# EasyBet — Step 7: Snapshot del segnale

Quando la strategia pre-match entra per la prima volta in VERDE, EasyBet salva uno snapshot persistente con:

- timestamp e minuto della partita
- risultato corrente
- strategia e score EasyBet 0–100
- xG casa/trasferta
- tiri in porta casa/trasferta
- tiri totali casa/trasferta
- big chances casa/trasferta
- tiri in area casa/trasferta
- tocchi in area casa/trasferta
- fonte (GoalDir/manuale/live-stats)
- riepilogo del segnale

Gli snapshot sono memorizzati nella tabella `signal_snapshots`. La combinazione partita + strategia + livello VERDE è unica, quindi il primo snapshot non viene sovrascritto.

Endpoint di lettura: `GET /api/matches/:id/signal-snapshots`.
