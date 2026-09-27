# EasyBet — Step 9: Admin con azioni di massa

Lo Step 9 aggiunge la gestione multipla delle partite nell'area Admin.

## Cosa puoi fare
- Selezionare singole partite tramite checkbox sulla card.
- Selezionare tutte le partite visibili secondo i filtri correnti.
- Deselezionare tutto.
- Applicare a più partite contemporaneamente:
  - strategia / tipo giocata;
  - quota ingresso;
  - esito;
  - Telegram ON/OFF.
- Copiare strategia e quota dalla prima partita selezionata alle altre.
- Eliminare in blocco le partite selezionate, con conferma.

## Backend
È stato aggiunto `POST /api/matches/bulk` con due azioni:
- `update`
- `delete`

L'endpoint limita ogni operazione a 300 ID e usa un'unica query SQL per l'aggiornamento o la cancellazione.

Quando Telegram viene riattivato in massa, il pre-match viene riarmato a 10 minuti e viene eseguito un controllo immediato dello scheduler.
