# EasyBet — Step 30

Correzione Over 1.5 FT: un gol non può trasformare automaticamente `ATTENDI` in `VERDE`.

## Nuova regola
Se Over 1.5 FT NON era già VERDE prima del primo gol:

1. quando arriva il gol, EasyBet passa a `RIVALUTA POST-GOL`;
2. aspetta almeno 4 minuti dal gol;
3. dopo i 4 minuti richiede nuova produzione offensiva costruita DOPO il gol:
   - +0.12 xG, oppure
   - +1 tiro in porta, oppure
   - +2 tiri totali;
4. soltanto dopo questa conferma il normale motore può tornare a produrre un VERDE.

Se il segnale era già VERDE prima del gol, il primo segnale resta valido e non viene annullato.

## Frontend
La protezione funziona sia in inserimento manuale sia con GoalDir usando la memoria locale della partita.

## Backend
`/api/live-stats` applica la stessa protezione in modo persistente.
Sono aggiunte colonne automatiche su Neon per:
- ultimo numero di gol osservato;
- minuto del gol che ha avviato la rivalutazione;
- minuto minimo di rivalutazione;
- baseline xG/SOT/tiri al momento del gol.

Questo impedisce anche a Telegram e agli snapshot di registrare un falso VERDE immediatamente dopo il gol.
