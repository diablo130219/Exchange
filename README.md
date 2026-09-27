# EasyBet — Step 28

Correzione completa della logica Over 0.5 HT quando il gol arriva prima della finestra operativa.

## Nuovo comportamento Over 0.5 HT

- Prima del 15' e risultato 0-0 → `ATTENDI`
- Prima del 15' ma è già stato segnato almeno un gol → `GOL PRE-FINESTRA`
- Tra 15' e 30', 0-0 → normale valutazione della strategia
- Se il gol è già avvenuto quando si apre/aggiorna l'analisi → `GOL GIÀ SEGNATO`
- Dopo il 30' sullo 0-0 → `NO BET`

Un gol segnato prima della finestra non viene mai trasformato in VERDE ufficiale e non viene contato come segnale EasyBet.

## Backend
Anche `/api/live-stats` applica lo stesso gate se riceve minuto e risultato, quindi un gol anticipato non può generare per errore uno snapshot o un alert VERDE.

## Dashboard
Le partite con mercato già consumato mostrano:
- `ESCLUSA`, oppure
- `CHIUSA`

invece di `DA CONTROLLARE`.

## Partite terminate
Se la partita viene poi marcata `non_entrata`, viene distinta come:
- `NON ENTRATA · GOL PRE-FINESTRA`

e la card spiega che il mercato è stato escluso perché l'evento era già avvenuto prima dell'ingresso.

Nessuna soglia statistica della strategia è stata modificata.
