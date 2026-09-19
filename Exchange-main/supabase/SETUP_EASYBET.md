# EasyBet su Supabase — configurazione una tantum

Questa versione sposta **notifiche Telegram e ricezione /start /stop** su Supabase, così continuano a funzionare anche quando Render è in sleep.

## 1. Database
Nel progetto Supabase esegui `supabase/migrations/001_easybet_schema.sql` nello SQL Editor oppure con Supabase CLI.

Render può continuare a usare la stessa app web: cambia soltanto `DATABASE_URL` con la connection string Postgres di Supabase (consigliato il pooler/session mode per Node/pg).

## 2. Edge Functions
Distribuisci:
- `telegram-webhook`
- `notify-due-matches`

Imposta questi secrets nelle Edge Functions:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` = una stringa casuale lunga
- `CRON_SECRET` = un'altra stringa casuale lunga

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili automaticamente nelle Edge Functions Supabase.

## 3. Webhook Telegram
In Render imposta:
- `SUPABASE_AUTOMATIONS=true`
- `TELEGRAM_WEBHOOK_URL=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook`
- `TELEGRAM_WEBHOOK_SECRET=<stesso valore impostato su Supabase>`

Al prossimo avvio il server registra automaticamente il webhook Telegram e NON avvia più il polling `getUpdates`.

## 4. Cron ogni minuto
Nel Supabase SQL Editor sostituisci i placeholder e lancia:

```sql
select cron.unschedule('easybet-notify-every-minute')
where exists (select 1 from cron.job where jobname = 'easybet-notify-every-minute');

select cron.schedule(
  'easybet-notify-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-due-matches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 5. Migrazione dati esistenti
Per copiare partite, iscritti Telegram e storico dal vecchio Postgres Render a Supabase:

```bash
SOURCE_DATABASE_URL='postgres://...' \
SUPABASE_DATABASE_URL='postgres://...' \
node scripts/migrate-to-supabase.js
```

Dopo avere verificato che i dati siano presenti in Supabase, imposta in Render `DATABASE_URL` uguale a `SUPABASE_DATABASE_URL`.

## Risultato
- Il sito su Render può andare in sleep senza bloccare gli avvisi.
- Le notifiche pre-match vengono controllate ogni minuto da Supabase Cron.
- `/start` e `/stop` vengono gestiti dal webhook Supabase, quindi non richiedono un processo Node sempre acceso.
- Niente più `getUpdates` polling su Render quando `SUPABASE_AUTOMATIONS=true`.
