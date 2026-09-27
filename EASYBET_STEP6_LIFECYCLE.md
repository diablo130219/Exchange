# EasyBet — Step 6: percorso PRE-MATCH → LIVE → SEGNALE → ESITO

Questa versione introduce una timeline persistente per ogni partita.

## Stati tracciati
- PRE-MATCH: coincide con la creazione della partita.
- LIVE: viene registrato al primo utilizzo del Live Analyzer o al primo pacchetto live ricevuto dal backend.
- SEGNALE: viene registrato la prima volta che la strategia pre-match raggiunge VERDE.
- ESITO: viene registrato quando viene assegnato un esito manuale.

## Nuovi campi DB
- `live_started_at`
- `signal_first_at`
- `signal_first_level`
- `signal_first_score`
- `outcome_set_at`

La timeline è mostrata direttamente nelle card e non modifica i criteri delle strategie.
