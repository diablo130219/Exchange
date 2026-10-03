
## STEP52 — Box API GoalDir leggibile
- Solo CSS del riquadro API: più larghezza e griglia interna stabile.
- Etichetta “API LIVE GOALDIR · OGGI” e contatore restano entrambi interamente leggibili.
- Nessun’altra modifica grafica o funzionale.


## STEP53 — Contatore GoalDir coerente
- Corretto il caso in cui l'header GoalDir `remaining` resta fermo (es. 7499) mentre EasyBet ha già tracciato più chiamate.
- Il residuo mostrato ora usa il valore più prudente tra il residuo API e `limite - chiamate tracciate`.
- Nessuna modifica grafica o ad altre funzioni.


## STEP54 — Favorito HT: tolleranza feed all’intervallo
- Modifica solo la logica della strategia Favorito HT.
- Se GoalDir salta lo stato HT e passa direttamente al 46’-48’, EasyBet tratta quella breve finestra come valutazione dell’intervallo invece di escludere subito la partita.
- Dal 49’ in poi, se non è stato registrato alcun ingresso, resta valida la chiusura ‘Secondo tempo iniziato’.
- Nessuna modifica grafica o alle altre strategie.


## STEP55 — Favorito HT: regola semplificata e coerente
- Rimossa completamente l’alternativa PUNTA 1 a quota 3,90 quando il favorito è sotto.
- Favorito in parità all’HT: PUNTA 1 solo a quota ≥ 1,85.
- Favorito sotto all’HT: BANCA 2 solo a quota ≤ 2,10.
- Titolo e descrizione della strategia ora dicono la stessa cosa.
- Nessuna modifica a grafica o altre strategie.

## STEP56 — Favorito HT: soglie live più realistiche
- Modificata solo la soglia live della strategia Favorito HT.
- Se il favorito è in parità all’HT: PUNTA 1 da quota 1,75.
- Se il favorito è sotto all’HT: BANCA 2 fino a quota 3,00.
- Nessuna modifica alla grafica, alle altre strategie o alla quota pre-match importata.

## STEP57 — Favorito HT: BANCA 2 massimo 2,50
- Modificata solo la soglia della giocata quando il favorito è sotto all’intervallo.
- Se il favorito è in parità all’HT: PUNTA 1 da quota 1,75 (invariato).
- Se il favorito è sotto all’HT: BANCA 2 solo fino a quota 2,50.
- Allineati anche testi informativi, Diario Exchange e messaggi Telegram alla nuova soglia.


## STEP58 — Favorito HT: quote modificabili dal menu
- Aggiunti accanto a “Favorita pre-match” i campi “Favorita pareggio quota =” e “Favorita sotto BANCA =”.
- Default: PUNTA in parità da 1,75; BANCA 2 se sotto fino a 2,50.
- I valori sono modificabili per ogni partita, vengono memorizzati nel Live Analyzer e usati realmente dalla logica VERDE / NO BET.
