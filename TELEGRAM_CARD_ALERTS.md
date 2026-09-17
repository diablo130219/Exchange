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
