# EasyBet V2 — Step 1

Questa versione introduce il nuovo frontend senza cambiare backend, database o API.

## Incluso
- nuova navigazione orizzontale: Oggi, Live, Segnali, Strategie, Indicatori, Money, Partite
- Scanner di giornata basato sugli endpoint già esistenti `/api/state` e `/api/matches`
- ricerca e filtri base
- card partita cliccabili
- nuovo Dossier pre-match della singola partita
- struttura del dossier: Panoramica, Squadre, Gol, Forma & H2H, Campo, Modello
- Dark / Light
- nessuna sezione quote/exchange nella V2 Step 1

## Sicurezza migrazione
Il vecchio frontend non è stato cancellato: è disponibile in `public/easybet-legacy.html`.

## Prossimi step
Riempire un blocco alla volta con le fonti già disponibili (EasyBet, CGMBet, GoalDir), senza modificare ancora le altre sezioni.
