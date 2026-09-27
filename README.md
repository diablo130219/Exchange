# EasyBet — pacchetto pulito

Versione finale con backup/export Admin.

## Backup JSON
Nell'area Admin è disponibile `Backup JSON`.

Il file contiene:
- tutte le partite
- tutti gli snapshot del primo segnale
- impostazioni notifiche
- cache stemmi squadre
- metadata e conteggi del backup

Non include PIN, secret, token Telegram, API key o DATABASE_URL.

## CSV partite
Il pulsante `CSV partite` esporta un file compatibile con Excel con:
- partita e campionato
- strategia
- quota
- esito
- lifecycle
- primo score VERDE
- minuto del primo segnale
- statistiche dello snapshot
- fonte e motivazione del segnale

Entrambe le esportazioni richiedono una sessione Admin valida e non vengono memorizzate nella cache del browser.
