STEP70 — MASANIELLO INTEGRATO MONEY MANAGEMENT

- Rimossa la vecchia UI laterale Masaniello Studio.
- Le casse Masaniello sono ora gestite con barra orizzontale coerente con Money Management.
- Nuova cassa, modifica/rinomina, duplica, elimina, backup/import restano disponibili.
- Motore matematico Masaniello invariato: stake, cicli, matrice, simulazioni, statistiche, confronto piani e storico.
- Compatibile con le casse Masaniello già salvate.


## STEP52 — Box API GoalDir leggibile
- Solo CSS del riquadro API: più larghezza e griglia interna stabile.
- Etichetta “API LIVE GOALDIR · OGGI” e contatore restano entrambi interamente leggibili.
- Nessun’altra modifica grafica o funzionale.


## STEP53 — Contatore GoalDir coerente
- Corretto il caso in cui l'header GoalDir `remaining` resta fermo (es. 7499) mentre EasyBet ha già tracciato più chiamate.
- Il residuo mostrato ora usa il valore più prudente tra il residuo API e `limite - chiamate tracciate`.
- Nessuna modifica grafica o ad altre funzioni.


## STEP54 — Favorito HT: tolleranza feed all’intervallo
- Modifica solo la logica della strategia Favorito HT.
- Se GoalDir salta lo stato HT e passa direttamente al 46’-48’, EasyBet tratta quella breve finestra come valutazione dell’intervallo invece di escludere subito la partita.
- Dal 49’ in poi, se non è stato registrato alcun ingresso, resta valida la chiusura ‘Secondo tempo iniziato’.
- Nessuna modifica grafica o alle altre strategie.


## STEP55 — Favorito HT: regola semplificata e coerente
- Rimossa completamente l’alternativa PUNTA 1 a quota 3,90 quando il favorito è sotto.
- Favorito in parità all’HT: PUNTA 1 solo a quota ≥ 1,85.
- Favorito sotto all’HT: BANCA 2 solo a quota ≤ 2,10.
- Titolo e descrizione della strategia ora dicono la stessa cosa.
- Nessuna modifica a grafica o altre strategie.

## STEP56 — Favorito HT: soglie live più realistiche
- Modificata solo la soglia live della strategia Favorito HT.
- Se il favorito è in parità all’HT: PUNTA 1 da quota 1,75.
- Se il favorito è sotto all’HT: BANCA 2 fino a quota 3,00.
- Nessuna modifica alla grafica, alle altre strategie o alla quota pre-match importata.

## STEP57 — Favorito HT: BANCA 2 massimo 2,50
- Modificata solo la soglia della giocata quando il favorito è sotto all’intervallo.
- Se il favorito è in parità all’HT: PUNTA 1 da quota 1,75 (invariato).
- Se il favorito è sotto all’HT: BANCA 2 solo fino a quota 2,50.
- Allineati anche testi informativi, Diario Exchange e messaggi Telegram alla nuova soglia.


## STEP58 — Favorito HT: quote modificabili dal menu
- Aggiunti accanto a “Favorita pre-match” i campi “Favorita pareggio quota =” e “Favorita sotto BANCA =”.
- Default: PUNTA in parità da 1,75; BANCA 2 se sotto fino a 2,50.
- I valori sono modificabili per ogni partita, vengono memorizzati nel Live Analyzer e usati realmente dalla logica VERDE / NO BET.

## STEP59 — Money Management Kelly 1/2
- Aggiunta voce di menu `Kelly 1/2` accanto a Masaniello (desktop e mobile).
- Calcolatore operativo Half Kelly: cassa attuale, quota, probabilità stimata e tetto massimo stake %.
- Formula Kelly pieno: `(p * quota - 1) / (quota - 1)`; stake operativo = 50% del Kelly pieno.
- Se l'edge è <= 0 viene indicato NO BET e lo stake è 0.
- Registrazione esito VINTA / PERSA / NULLA con aggiornamento automatico della cassa.
- Storico locale persistente nel browser con quota, probabilità, stake, P/L e cassa aggiornata.
- Pulsante `Nuova cassa` per iniziare una gestione separata.

## STEP60 — Kelly 1/2 multi-cassa
- Kelly 1/2 supporta più casse indipendenti, come il Masaniello.
- Ogni cassa conserva separatamente bankroll iniziale/attuale, quota, probabilità, stake massimo e storico.
- Possibilità di creare, selezionare, rinominare, reimpostare ed eliminare casse.
- Migrazione automatica dalla vecchia cassa singola STEP59 alla prima cassa multi-cassa.


## STEP61 — Kelly automatico senza probabilità manuale
- Rimossa dall'interfaccia la voce `Probabilità stimata %`.
- Il Kelly 1/2 usa automaticamente lo storico VINTA/PERSA della cassa selezionata.
- Per l'avvio viene usato un prior prudente equivalente al 55%, progressivamente sostituito dai risultati reali.
- Storico semplificato: non mostra più la colonna probabilità.
- L'utente inserisce solo cassa, quota, tetto stake e risultato.

## STEP62 - Kelly 1/2 con stima da filtro
- Ripristinato il campo `% successo filtro / stima Kelly`.
- La percentuale viene salvata per ogni singola cassa Kelly.
- Le casse create in STEP61 vengono migrate automaticamente con valore iniziale 55% solo se non avevano già una percentuale salvata.
- Il Kelly usa quota + percentuale della cassa per calcolare edge, Kelly pieno, 1/2 Kelly e stake consigliato.
- La percentuale usata viene salvata nello storico di ogni giocata.


## STEP64 — Kelly stake minimo operativo 2 €
- Lo stake minimo operativo del Kelly è 2,00 €.
- Se il Kelly teorico è positivo ma inferiore a 2 €, viene proposto 2,00 €.
- Se 2 € supererebbero il tetto massimo % impostato (o la cassa è sotto 2 €), viene mostrato NO BET invece di violare il limite di rischio.
- Kelly zero/negativo resta NO BET: non viene forzata una puntata minima.

## STEP65 — Kelly con puntata minima manuale 2 €
- Il Kelly continua a mostrare il proprio calcolo teorico e l'eventuale NO BET.
- Quando il Kelly non propone una giocata (edge <= 0) o il minimo 2 € è bloccato dal tetto, compare `PUNTA COMUNQUE 2,00 €`.
- L'utente può quindi forzare manualmente una puntata da 2 € a prescindere dal suggerimento Kelly, purché la cassa abbia almeno 2 €.
- La puntata manuale viene registrata normalmente nello storico e aggiorna la cassa; dopo l'esito l'override viene disattivato.


STEP66
- Rimossa la forzatura "Punta comunque 2,00 €".
- Aggiunto campo "Importo puntata €" scelto manualmente dall'utente (minimo 2,00 €).
- Il Kelly resta un riferimento teorico; VINTA/PERSA/NULLA usano l'importo reale inserito.

## STEP67 — Kelly multi-giocata + multiple
- Ogni cassa Kelly può contenere più giocate aperte contemporaneamente della stessa strategia.
- Ogni singola ha descrizione, quota, importo manuale, Kelly teorico e registrazione esito indipendente.
- È possibile selezionare 2 o più singole e trasformarle in una multipla.
- La multipla mostra quota totale, stima combinata (ipotesi di indipendenza), Kelly teorico e importo scelto manualmente.
- Le singole trasformate in multipla vengono rimosse dalla lista singole per evitare doppia registrazione involontaria.
- Storico unico per cassa con distinzione Singola/Multipla.

## STEP68 — Money Management unificato

La navigazione pubblica ora espone una sola area **Money Management**.

Metodi disponibili:
- **Masaniello**: conserva il motore completo già presente (cicli, piano, quote, storico, simulazioni).
- **Roserpina variabile**: cassa dedicata con resa obiettivo, numero di vincite, quota reale, perdite accumulate e stake ricalcolato.
- **Kelly**: ogni cassa può scegliere **1/4 Kelly**, **1/2 Kelly** oppure **Kelly totale**; restano multi-giocata e multiple della strategia.
- **Martingala**: cassa dedicata con stake base, moltiplicatore, serie di perdite e limite massimo percentuale della cassa.
- **Bolletta multipla classica**: builder separato con più selezioni, quota totale, importo libero e storico.

Il pulsante **+ Nuova cassa** nell'area Money Management permette di scegliere prima il tipo di gestione da creare.


## STEP69 — Accesso separato Betting classico / Exchange Live
- Dopo il PIN, `Accedi` mostra una scelta tra **Betting classico** ed **Exchange Live**.
- Le nuove partite vengono salvate con `bettingArea=classic|live`.
- Le partite già esistenti restano automaticamente nell'area **Exchange Live**.
- L'admin mostra solo le partite dell'area scelta; è disponibile `Cambia area`.
- L'import CSV delle strategie live è visibile solo in Exchange Live.
- La pagina pubblica Live esclude le partite Betting classico.

## STEP71 - Masaniello layout uniforme
- Rimossa la vecchia nota/modulo intermedio del Masaniello dentro Money Management.
- Barra casse Masaniello resa coerente con Roserpina/Kelly/Martingala.
- Header cassa con nome, cassa attuale e P/L nello stesso stile degli altri metodi.
- Comandi Rinomina/Modifica, Duplica, Elimina, Backup e Importa spostati nel pannello della cassa selezionata.
- KPI del Masaniello riallineati alle card Money Management.
- Motore matematico, cicli, matrice, simulatore, statistiche e storico invariati.

## STEP72 — Storico Exchange Live separato dal Betting classico
- Tutte le partite già presenti al momento dell'aggiornamento vengono assegnate una sola volta a Exchange Live.
- Il Betting classico parte vuoto finché non vengono inserite nuove partite classiche.
- Le nuove partite mantengono in modo persistente l'area scelta (`classic` o `live`).
- La migrazione usa un marker persistente e non viene ripetuta ai riavvii, quindi non sposta in futuro le partite classiche verso il Live.
