# EasyBet — Step 20: validazione dello Score 0–100

La pagina Statistiche ora verifica se fasce di Score EasyBet più alte corrispondono realmente a risultati migliori.

## Fasce
- 0–59
- 60–69
- 70–79
- 80–89
- 90–100

Per ogni fascia mostra:
- numero di ingressi
- vinte / perse
- non entrate
- win rate sugli ingressi
- dimensione indicativa del campione

Cliccando una fascia si vedono le partite che la compongono, con:
- partita
- strategia
- campionato
- score
- esito

## Fonte dati
La validazione usa il `signal_first_score` del primo VERDE ufficiale della strategia pre-match e gli esiti finali già salvati nel database.

Il filtro temporale della pagina Statistiche (7 giorni / 30 giorni / stagione / tutto) si applica anche alla validazione.

Nota: lo Score EasyBet resta un punteggio di aderenza ai criteri, non una probabilità di vincita. Questa sezione serve proprio a calibrarlo sui risultati storici reali.
