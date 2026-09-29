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

## STEP35 — Import CSV Betflag sempre visibile
- Pulsante “IMPORTA CSV BETFLAG” direttamente nella sidebar del Diario Exchange, senza dover aprire la scheda Operazioni.
- Usa lo stesso parser `MovimentiChiusi.csv` già presente e mostra l'anteprima prima dell'importazione.
- Il caricamento è disponibile da qualunque scheda del Diario finché esiste un periodo attivo.

## STEP36 – Import Betflag iniziale + palette oro/avorio
- Import CSV Betflag disponibile anche quando non esiste ancora alcun periodo.
- Se il CSV viene caricato dalla schermata iniziale, EasyBet legge l'intervallo date, precompila il primo periodo e dopo il salvataggio apre automaticamente l'anteprima import.
- Diario Exchange forzato sulla palette EasyBet oro/avorio, indipendentemente dal tema globale, eliminando pannelli e pulsanti neri.


## STEP37
- Diario Exchange espanso a tutta la larghezza della finestra quando si apre la voce di menu.
- Header e banner EasyBet restano invariati e centrati alla larghezza originale.
- Layout Exchange continua a essere responsive su tablet e mobile.

## STEP40 — Masaniello Studio integrato
- Nuova pagina `Masaniello` nel menu pubblico EasyBet, area privata admin.
- Grafica oro/avorio coerente con Diario Exchange e layout full-width sotto il banner EasyBet invariato.
- Porting web del motore principale del software desktop: N eventi / K vittorie, calcolo stake, obiettivo, matrice, quote pianificate, fino a 5 giocate in attesa, esiti vinta/persa/nulla, cicli e storico.
- Schede: Gioca, Piano e matrice, Confronta piani, Simulatore, Statistiche, Metodi a confronto, Storico e backup.
- Persistenza PostgreSQL tramite `masaniello_state`, autosalvataggio e import/export JSON.
- Protezione anti-reset del form durante refresh automatici EasyBet.

## STEP42 — Dark mode Diario Exchange + Masaniello
- Diario Exchange ora segue il selettore globale Light/Dark.
- Masaniello ora segue il selettore globale Light/Dark.
- In modalità Light restano oro/avorio.
- In modalità Dark diventano grafite/bruno scuro con accenti oro, mantenendo verdi/rossi funzionali.
- Banner e struttura fullscreen restano invariati.
