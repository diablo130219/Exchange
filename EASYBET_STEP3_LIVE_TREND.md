# EasyBet — Step 3: Live Analyzer dinamico

Questa versione aggiunge al Live Analyzer un livello dinamico basato sugli aggiornamenti successivi della stessa partita.

## Novità

- storico locale degli ultimi ~20 minuti di polling della partita aperta;
- pressione recente sugli ultimi 5 minuti;
- pressione recente sugli ultimi 10 minuti;
- trend `CRESCENTE`, `STABILE`, `CALANTE` (o indicazione provvisoria finché non ci sono abbastanza campioni);
- confronto implicito tra ultimi 5 minuti e i 5 minuti precedenti quando sono disponibili almeno ~10 minuti di storico;
- lettura delle variazioni di xG, tiri, tiri in porta, big chances, tiri in area, corner e tocchi in area;
- qualità descrittiva `ALTA / MEDIA / BASSA` su ogni segnale, combinando copertura dei criteri, stato strategia e trend recente.

## Nota

La qualità non è una probabilità di vincita e non modifica i paletti del motore strategie. È un indicatore di supporto operativo. Lo score numerico 0–100 resta previsto per lo Step 4.

## Funzionamento

Con GoalDir automatico il Live Analyzer effettua polling ogni 60 secondi. I primi minuti mostrano `Raccolta dati`; appena esiste abbastanza storico, il pannello calcola trend e delta 5/10 minuti.

In modalità manuale lo storico viene aggiornato ogni volta che si inseriscono nuovi dati e si preme `ANALIZZA / AGGIORNA` con un minuto diverso.
