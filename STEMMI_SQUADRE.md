# Gestione stemmi EasyBet

Questa versione usa tre livelli:
1. ricerca automatica con normalizzazione del nome e alias;
2. fallback con più varianti del nome e controllo del paese/campionato;
3. override manuale dall'admin tramite il pulsante **Stemma** sotto ogni squadra.

Nel prompt admin incolla un URL immagine diretto `https://...`. Scrivi `AUTO` per cancellare l'override e tornare alla ricerca automatica.

La cache positiva dura 30 giorni; i mancanti vengono riprovati dopo 12 ore.
