# EasyBet — Step 2: storico automatico delle performance

Questa versione aggiunge statistiche aggregate calcolate direttamente dal database `matches`, senza duplicare gli esiti in una seconda tabella.

## Endpoint

`GET /api/performance-stats`

Restituisce:
- riepilogo totale;
- oggi, ultimi 7 giorni, ultimi 30 giorni e storico completo;
- rendimento per strategia;
- rendimento per campionato;
- serie giornaliera degli ultimi 60 giorni disponibili.

## Metriche

Per ogni gruppo vengono calcolati:
- partite concluse;
- ingressi effettivi;
- vinte;
- perse;
- non entrate;
- percentuale di ingresso;
- win rate sugli ingressi;
- quota media sugli ingressi con quota disponibile.

Le strategie vengono normalizzate in categorie canoniche (OVER 0.5 HT, OVER 1.5 FT, BANCA LA X, SEGNA LA FAVORITA, SEGNO 1) per evitare righe duplicate dovute a variazioni del testo.

## Interfaccia

La sezione `Statistiche` mantiene i grafici esistenti e aggiunge:
- 4 card temporali;
- tabella rendimento per strategia;
- tabella rendimento per campionato.

I dati si aggiornano quando si apre la pagina Statistiche e durante il polling mentre la pagina resta aperta.
