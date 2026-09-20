# Gestione stemmi EasyBet

Questa versione usa più livelli di recupero per ridurre al minimo i placeholder:
1. ricerca automatica con normalizzazione del nome;
2. alias aggiuntivi per squadre abbreviate o con varianti comuni;
3. fallback su più query alternative;
4. retry rapido dei mancanti (5 minuti invece di 12 ore);
5. override manuale dall'admin tramite il pulsante **Stemma** sotto ogni squadra.

Nel prompt admin puoi incollare un URL immagine diretto `https://...`.
Scrivi `AUTO` per cancellare l'override e tornare alla ricerca automatica.

Alias aggiunti: Várda SE → Kisvárda FC, Sirius → IK Sirius, Servette → Servette FC.


## Ricerca admin per data
Ogni gruppo data dell'admin include ora un campo di ricerca istantanea che filtra per squadra, campionato, strategia e quota senza uscire dal giorno selezionato.

## Fallback automatico aggiuntivo
Se TheSportsDB non restituisce uno stemma, il server prova anche Wikipedia tramite API pubblica, cercando il club per nome e campionato/paese. Questo riduce ulteriormente i casi in cui restano le iniziali.


## Fix immagini errate (v2)
Il fallback Wikipedia è disattivato perché poteva restituire foto di città, stadi o giocatori al posto dello stemma. Ora vengono accettati solo badge dal provider calcistico; se non viene trovato un badge affidabile, resta il placeholder con le iniziali. Le vecchie immagini automatiche da Wikimedia vengono ignorate e ricaricate. Alias aggiunti per Basel, St. Gallen, Atlético Madrid, Real Madrid, Sint-Truiden, Westerlo e Saint-Étienne.
