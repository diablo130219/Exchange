# EasyBet — Step 15: memoria dati manuali + segnale persistente

Correzioni applicate:

- i dati inseriti manualmente nel Live Analyzer vengono salvati per singola partita nel browser;
- restano disponibili dopo chiusura del Live Analyzer, cambio sezione e ricaricamento pagina;
- vengono cancellati solo premendo `SVUOTA DATI`;
- viene ricordata anche la modalità MANUALE/AUTO;
- riaprendo una partita in modalità manuale, EasyBet non sovrascrive subito i dati con GoalDir;
- premendo `ANALIZZA / AGGIORNA` in modalità manuale, i dati vengono inviati anche al motore server-side `/api/live-stats`;
- se il motore server conferma VERDE, il primo segnale viene memorizzato nel database indipendentemente dall'invio Telegram;
- dopo l'analisi la Home/Live viene aggiornata, quindi la timeline può mostrare `SEGNALE` e il dashboard può contare il verde.

Non sono state cambiate le soglie delle strategie.
