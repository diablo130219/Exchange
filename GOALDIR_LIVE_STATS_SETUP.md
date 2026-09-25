# GoalDir / BSD – statistiche live EasyBet

Questa versione usa SOLO le statistiche live REST di GoalDir/BSD. Non usa quote live e non richiede il WebSocket a pagamento.

## Configurazione
1. Crea un account gratuito GoalDir/BSD e copia il token API.
2. Su Render: servizio EasyBet → Environment → Add Environment Variable.
3. Nome: `GOALDIR_API_KEY`
4. Valore: il token copiato.
5. Salva e fai redeploy.

Nel popup **Analizza Live** il pulsante **DATI LIVE AUTO** tenta di associare la partita EasyBet al feed GoalDir. Se la competizione è coperta, aggiorna minuto, risultato e statistiche. Finché il popup resta aperto riprova ogni 60 secondi.

Se GoalDir non copre la partita o una metrica non è disponibile, EasyBet lascia `N/D` e puoi continuare a usare il copia/incolla manuale.
