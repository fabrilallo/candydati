# Colloqui dal calendario

Fissare un colloquio di solito richiede una catena di email. In Candydati il candidato sceglie da un link un orario
libero per tutti gli intervistatori, e ognuno trova l'evento nel proprio calendario. L'ATS conosce ogni colloquio
prenotato, quindi può ricordarlo, avvisare il team e far partire le automazioni della fase.

## Collega il tuo calendario

Ognuno collega il proprio calendario una volta sola, da **Impostazioni → Calendario**, incollando il suo **indirizzo
iCal segreto**:

- **Google Calendar** (dal computer): ingranaggio → *Impostazioni*; nella colonna a sinistra, sotto *Impostazioni per i
  miei calendari*, clicca il tuo nome; scorri fino a *Integra calendario* e copia *Indirizzo segreto in formato iCal*
  (finisce con `basic.ics`; non usare l'indirizzo pubblico). Se il campo manca, l'amministratore di Google Workspace
  l'ha disattivato per il dominio.
- **Outlook / Microsoft 365:** Impostazioni → Calendario → Calendari condivisi → *Pubblica un calendario*, scegli *Può
  visualizzare quando sono occupato*, copia il link ICS.
- **iCloud:** condividi il calendario come pubblico e copia il link (va bene anche un indirizzo `webcal://`).

Imposta giorni e orari di lavoro e il fuso orario. Vengono letti solo gli **orari occupati** delle prossime due
settimane: mai titoli, descrizioni, luoghi o partecipanti. L'indirizzo è cifrato e non viene più mostrato; viene
cancellato quando scolleghi il calendario o lasci l'organizzazione. Chi non ha collegato il calendario conta come
libero nelle ore lavorative predefinite, e il recruiter lo sa.

## Proponi un colloquio

Sulla candidatura premi **Proponi colloquio**: scegli la fase (intervistatori e durata arrivano dall'annuncio), la
modalità (videochiamata, in sede, telefono) e dove (link della riunione, indirizzo o telefono).

Il candidato riceve un'email nella sua conversazione con un link personale e due o tre orari liberi in giorni diversi.
Aprendo un orario lo trova già scelto; non si prenota nulla finché il candidato non conferma.

## Prenotare, spostare, annullare

- **Orari liberi:** le ore lavorative di tutti meno i loro impegni e gli altri colloqui prenotati, ogni 30 minuti, da un
  giorno a due settimane in avanti.
- **Mai due prenotazioni sullo stesso orario:** alla conferma i calendari vengono riletti e l'orario ricontrollato sotto
  blocco.
- **Invito per tutti:** candidato e intervistatori ricevono un invito per il calendario (.ics). Spostare aggiorna lo
  stesso evento, annullare lo toglie. Il candidato può spostare o annullare fino a 12 ore prima.
- **Promemoria:** il candidato riceve un promemoria il giorno prima.
- **Il team lo sa:** intervistatori e chi l'ha proposto ricevono una notifica nell'app. I trigger di automazione *Il
  candidato prenota il colloquio* e *Il colloquio viene annullato* fanno partire le regole della fase, per esempio
  un'attività per preparare il colloquio.

## Regole

- **Decidono le persone.** Proporre significa scrivere a un candidato, quindi lo fa una persona: l'assistente non
  propone né prenota mai.
- **Permessi.** `interview:schedule` (owner, admin, recruiter, hiring manager) per proporre e annullare;
  `interview:read` per vederli (chi legge i candidati). Collegare un calendario è personale: mai con una chiave API.
- **Nel registro.** Collegare un calendario, proporre, prenotare, spostare e annullare finiscono nel registro delle
  azioni, senza l'indirizzo del calendario.
