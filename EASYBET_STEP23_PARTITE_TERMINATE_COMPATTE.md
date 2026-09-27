# EasyBet — Step 23: Partite terminate compatte

Migliorata la sezione Partite terminate senza cambiare la logica degli esiti.

- card uniformate in altezza;
- area segnale sempre presente, così le card non cambiano altezza quando esiste lo snapshot;
- distinzione esplicita tra `NON ENTRATA · SEGNALE AVUTO` e `NON ENTRATA · NESSUN SEGNALE`;
- se il primo VERDE esiste, viene mostrato score e pulsante compatto `PERCHÉ VERDE?`;
- se non esiste, compare uno spazio informativo coerente `NESSUNO SNAPSHOT`;
- timeline resa più compatta nelle partite concluse;
- stili Light/Dark mantenuti.

Nessuna modifica a strategie, segnali, esiti o database.
