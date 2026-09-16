# EasyBet - Neon scheduled wake-up

The project exposes `POST /api/cron/telegram`.

Set this Render environment variable:

```
CRON_SECRET=<same value configured in the Neon Function>
```

The endpoint immediately runs one Telegram notification check through `scheduler.checkOnce()`.

A Neon Function named `easybetcron` has been prepared to call:

```
https://exchange-igc1.onrender.com/api/cron/telegram
```

The Neon account currently does not expose native scheduled Function triggers for this project, so an external HTTP scheduler is still required to invoke the Neon Function every minute.
