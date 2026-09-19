# Gestione stemmi EasyBet

Questa versione usa più livelli di recupero per ridurre al minimo i placeholder:
1. ricerca automatica con normalizzazione del nome;
2. alias aggiuntivi per squadre abbreviate o con varianti comuni;
3. fallback su più query alternative;
4. retry rapido dei mancanti (5 minuti invece di 12 ore);
5. override manuale dall'admin tramite il pulsante **Stemma** sotto ogni squadra.

Nel prompt admin puoi incollare un URL immagine diretto `https://...`.
Scrivi `AUTO` per cancellare l'override e tornare alla ricerca automatica.
