# EasyBet Telegram Card Alerts — Concept 1 Premium Dark Gold

Questa versione usa il Concept 1 scelto per gli alert Telegram.

## Stile
- Base premium dark / black-gold
- Doppio bordo oro
- Badge `Tra 10 min` e `LIVE SOON`
- Nome partita in forte evidenza
- Footer minimale con orario
- Nessun link o bottone Telegram sotto la card
- Nessuna caption testuale: viene inviata solo l'immagine

## Varianti automatiche
Lo stesso layout viene applicato a tutte le strategie. Il colore della barra centrale cambia automaticamente:
- OVER / GOAL: verde premium
- BANCA / LAY / SEGNO: oro premium
- altre strategie: oro EasyBet

Le icone dentro la card sono disegnate direttamente in SVG, evitando emoji che su alcuni server potevano comparire come quadratini o simboli strani.

## Timing
- Ogni alert pre-match viene inviato automaticamente **10 minuti prima** dell'orario di inizio.
- Se l'invio Telegram fallisce, la partita non viene marcata come notificata e il sistema ritenta.

## Fix modifica orario
Quando data/orario di una partita vengono modificati, `notified` viene ora rimesso a `false`
e l'alert viene riarmato automaticamente a 10 minuti dal nuovo calcio d'inizio.
Se il nuovo orario è già nella finestra dei 10 minuti, viene eseguito anche un controllo immediato.

## Fix notifiche duplicate
La notifica viene ora "prenotata" nel database in modo atomico prima dell'invio.
Questo impedisce che scheduler interno e cron esterno inviino la stessa partita due volte
quando scattano nello stesso momento. In caso di errore Telegram la prenotazione viene
rilasciata e l'invio può essere ritentato.
