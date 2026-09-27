# EasyBet – Step 10: Sicurezza Admin

## Cosa cambia
- Il PIN non viene più creato o salvato nel browser.
- Il PIN viene verificato dal server tramite la variabile ambiente `ADMIN_PIN`.
- Dopo il login il server rilascia un cookie di sessione `HttpOnly`, `SameSite=Strict` e `Secure` in HTTPS.
- La sessione scade automaticamente (default 12 ore).
- Dopo 5 PIN errati dallo stesso IP in 15 minuti, i tentativi vengono temporaneamente bloccati.
- Il pulsante **Blocca** invalida il cookie nel browser.

## Endpoint protetti
Richiedono una sessione admin valida:
- POST `/api/matches`
- PATCH `/api/matches/:id`
- POST `/api/matches/bulk`
- POST `/api/matches/:id/lifecycle`
- DELETE `/api/matches/:id`
- POST `/api/matches/:id/test-alert`
- PUT `/api/team-crest`
- PUT `/api/alert-settings`

Restano pubblici gli endpoint di sola lettura e `/api/live-stats`, perché il bookmarklet/live collector deve poter inviare dati cross-origin. Il cron Telegram continua a essere protetto con `CRON_SECRET`.

## Variabili da aggiungere su Render
- `ADMIN_PIN`: scegli un PIN/password non banale.
- `ADMIN_SESSION_SECRET`: stringa casuale lunga; consigliata.
- `ADMIN_SESSION_HOURS`: opzionale, default 12.

Dopo aver aggiunto le variabili, esegui un nuovo deploy.

## Nota sul Live Analyzer pubblico
Lo storico lifecycle/snapshot viene scritto tramite un endpoint protetto. Se usi il Live Analyzer dalla pagina pubblica nello stesso browser, effettua prima il login nell'area Gestione: il cookie vale per lo stesso dominio e consente il salvataggio. La visualizzazione pubblica continua a funzionare anche senza login.
