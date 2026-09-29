# EasyBet — Step 31

Migliorata la leggibilità del grafico `Andamento win rate`.

Passando il mouse sopra ogni puntino viene mostrato:
- data
- win rate
- numero di ingressi
- vinte
- perse

Il puntino si ingrandisce quando è attivo.

Il tooltip funziona anche con:
- focus da tastiera
- click/tap su dispositivi touch

È presente anche il tooltip SVG nativo come fallback.

Nessuna modifica ai calcoli statistici: cambia soltanto la leggibilità del grafico.

## STEP 32 — Diario Exchange integrato

Il progetto include ora la sezione privata **Diario Exchange** dentro il sito EasyBet, con grafica coerente dark/light e responsive.

Funzioni principali:
- periodi con cassa iniziale, target, stake, durata e modalità di crescita;
- stop loss, stop win, limite sessioni e limite stake;
- giornate con fino a 10 sessioni, depositi/prelievi e note;
- operazioni dettagliate (partita, campionato, mercato, strategia, Punta/Banca/Trading, quote, stake, minuto, P/L);
- sincronizzazione automatica del P/L delle operazioni nella relativa sessione;
- dashboard cassa reale vs target, profitto, drawdown e proiezione;
- statistiche per strategia, mercato, lato, giorno della settimana e campionato;
- import CSV (incluse colonne tipiche Betflag) ed export CSV;
- calcolatori Green-Up Punta→Banca, Banca→Punta e responsabilità Lay;
- salvataggio su PostgreSQL nella tabella `exchange_periods`;
- accesso ai dati protetto dalla sessione admin EasyBet;
- i periodi del Diario Exchange sono inclusi nel backup generale admin.

## STEP33 - Diario Exchange fedele al software desktop
- Interfaccia web riorganizzata come il software Diario Exchange: sidebar periodi, Diario, Operazioni, Statistiche, Andamento e riepilogo, Calcolatori exchange.
- Nuovo import dedicato `MovimentiChiusi.csv` Betflag con anteprima, esclusione automatica righe `NaN`, riconoscimento campionato/partita/mercato, raggruppamento stessa partita nella stessa sessione e prevenzione dei doppioni tramite riferimento Betflag.
- Import CSV/tabella generico mantenuto separato.
- Export CSV del periodo allineato al software desktop (righe giornaliere con sessioni I-X, depositi/prelievi e note).
- Backup/ripristino JSON e report stampabile dal browser.
- Grafica adattata allo stile EasyBet dark/light senza cambiare la logica del Diario.
