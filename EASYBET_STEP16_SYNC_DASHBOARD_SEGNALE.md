# EasyBet — Step 16: sincronizzazione segnale LIVE / dashboard

Corretto il caso mostrato nello screenshot:
- la timeline registrava correttamente `SEGNALE 100/100`;
- il dashboard continuava però a mostrare `SEGNALI VERDI 0` e `DA CONTROLLARE`.

Correzioni:
- il dashboard usa `liveLastLevel` quando disponibile;
- se manca ancora lo stato live corrente ma esiste già `signalFirstAt`/`signalFirstLevel=verde`, usa il segnale persistente come fallback;
- dopo `ANALIZZA / AGGIORNA` manuale la card e il dashboard vengono aggiornati immediatamente in memoria;
- seguono due riallineamenti col database per coprire latenze di rete/scrittura;
- `markLifecycle` ora aggiorna e ridisegna subito la UI;
- l'età della priorità usa il timestamp del primo segnale come fallback.

Risultato atteso nello scenario dello screenshot:
- `SEGNALI VERDI: 1`
- `QUASI PRONTI: 0`
- riga priorità: `VERDE`
- timeline: `SEGNALE 100/100` resta invariata.
