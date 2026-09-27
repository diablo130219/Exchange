# EasyBet — Step 19: snapshot visibile del segnale

Lo snapshot del primo VERDE ora è consultabile dall'interfaccia.

## Nuovo pulsante
Quando una partita ha `signalFirstAt`, sulla card compare:
- `◎ PERCHÉ VERDE?`

## Schermata snapshot
Mostra la fotografia congelata del momento in cui la strategia pre-match è diventata VERDE:
- strategia ufficiale
- score EasyBet 0–100
- minuto
- risultato al momento del segnale
- fonte (manuale / GoalDir)
- xG casa/ospite
- tiri in porta
- tiri totali
- big chances
- tiri in area
- tocchi in area
- motivazione/summary
- esito finale
- quota ingresso
- timestamp del segnale

I valori dello snapshot non vengono sostituiti dai dati successivi della partita.

La funzione usa l'endpoint già esistente:
`GET /api/matches/:id/signal-snapshots`

Nessuna modifica alle soglie o alla logica delle strategie.
