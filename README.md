
## STEP52 — Box API GoalDir leggibile
- Solo CSS del riquadro API: più larghezza e griglia interna stabile.
- Etichetta “API LIVE GOALDIR · OGGI” e contatore restano entrambi interamente leggibili.
- Nessun’altra modifica grafica o funzionale.


## STEP53 — Contatore GoalDir coerente
- Corretto il caso in cui l'header GoalDir `remaining` resta fermo (es. 7499) mentre EasyBet ha già tracciato più chiamate.
- Il residuo mostrato ora usa il valore più prudente tra il residuo API e `limite - chiamate tracciate`.
- Nessuna modifica grafica o ad altre funzioni.
