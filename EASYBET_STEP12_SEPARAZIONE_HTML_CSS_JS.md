# EasyBet — Step 12: separazione HTML / CSS / JavaScript

Sono state mantenute separate le due aree funzionali:

- `public/easybet.html` → consultazione EasyBet
- `public/easybet-admin.html` → caricamento e gestione partite

La modifica è solo architetturale.

## Nuovi file

### Sito EasyBet
- `public/easybet.html`
- `public/easybet.css`
- `public/easybet.js`

### Admin
- `public/easybet-admin.html`
- `public/easybet-admin.css`
- `public/easybet-admin.js`

### Tema condiviso
- `public/theme-bootstrap.js`

Il bootstrap del tema viene caricato nel `<head>` prima del CSS, così la modalità Light/Dark viene applicata prima del primo rendering e non viene reintrodotto il flash nero.

Non sono state modificate le strategie, il database, Telegram, GoalDir o gli endpoint del backend.
