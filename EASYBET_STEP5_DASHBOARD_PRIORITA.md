# EasyBet — Step 5 Dashboard priorità LIVE

Aggiunta una dashboard nella vista LIVE per ridurre il lavoro manuale quando sono presenti molte partite contemporaneamente.

## Cosa mostra
- LIVE ORA: numero di partite iniziate e ancora senza esito.
- SEGNALI VERDI: partite con ultimo livello LIVE verde.
- QUASI PRONTI: partite con ultimo livello giallo/attendi.
- ENTRO 30 MIN: partite programmate nei successivi 30 minuti.

## Coda "Cosa devo guardare adesso"
EasyBet ordina fino a 6 partite LIVE dando priorità a:
1. segnale verde;
2. segnale giallo/quasi pronto;
3. aggiornamento recente del Live Analyzer;
4. finestra temporale operativa della partita.

Cliccando una riga della coda si apre direttamente il Live Analyzer della partita.

Nota: la dashboard usa `live_last_level` e `live_last_updated` già presenti nel database. Non modifica le strategie e non crea nuovi segnali: organizza quelli disponibili.
