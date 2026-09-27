# EasyBet — Step 21: storico per minuto d'ingresso

La pagina Statistiche ora analizza il rendimento del primo VERDE ufficiale in base al minuto in cui è nato.

## Fasce
- 0–14
- 15–25
- 26–35
- 36–45
- 46–60
- 61–75
- 76+

Per ogni fascia mostra:
- ingressi
- vinte / perse
- non entrate
- win rate
- dimensione indicativa del campione

Cliccando una fascia si vedono le partite che la compongono, con strategia, campionato, minuto, score ed esito.

## Fonte del minuto
Il minuto viene preso dallo snapshot persistente del primo segnale VERDE (`signal_snapshots.minute`), quindi non viene ricostruito a posteriori.

Il filtro Statistiche (7 giorni / 30 giorni / stagione / tutto) si applica anche a questa analisi.

Questa funzione non cambia le finestre operative delle strategie: serve solo a validarle sullo storico reale.
