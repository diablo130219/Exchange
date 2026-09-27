# EasyBet — pacchetto pulito

Pacchetto di produzione con sicurezza Admin rafforzata.

## Variabili Admin obbligatorie su Render
- `ADMIN_PIN` — almeno 6 caratteri
- `ADMIN_SESSION_SECRET` — almeno 32 caratteri casuali
- `ADMIN_SESSION_HOURS` — durata sessione, ad esempio `12`

## Rafforzamenti Step 26
- sessione firmata con nonce casuale
- nessun secret di fallback
- cookie HttpOnly / SameSite=Strict / Secure su HTTPS
- blocco delle richieste Admin cross-site
- limite tentativi login con `Retry-After`
- cache disabilitata sugli endpoint di autenticazione
- header HTTP di sicurezza
- `X-Powered-By` disattivato

Le API pubbliche necessarie al Live Analyzer restano invariate.
