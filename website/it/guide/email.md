# Email

Candydati ha bisogno di un vero fornitore email. Conferma dell'account, recupero della password, inviti, ricevute di
candidatura e ogni messaggio ai candidati sono email: se non arrivano, le persone non riescono ad accedere e i
candidati non ricevono la loro risposta. Per questo, finché l'email non funziona, un'installazione rifiuta inviti,
pubblicazioni e candidature.

Puoi impostarla sul server (sotto) oppure, se il server la lascia vuota, dall'app: **Impostazioni, Email**, scegli SMTP
o Resend, inserisci il dominio di invio e premi **Salva e invia un'email di prova**. Può cambiarla solo il primo
proprietario (o un indirizzo di `INSTANCE_ADMIN_EMAILS`), e non viene salvato nulla se l'email di prova non arriva.

Due opzioni, da scegliere durante l'installazione (`CANDYDATI_EMAIL_PROVIDER`):

| Opzione | Quando va bene |
|---|---|
| **SMTP** | hai già una casella o un servizio di invio: la casella aziendale (Google Workspace, Microsoft 365, Aruba, Register.it, OVH...) o qualsiasi servizio transazionale che offre SMTP |
| **Resend** | vuoi un servizio transazionale con API, verifica del dominio ed email in arrivo nello stesso posto |

Per cambiare fornitore in seguito, esegui `candydati config` e modifica le righe `EMAIL_*`, `SMTP_*` o
`RESEND_API_KEY`.

## SMTP

L'installer chiede:

| Campo | Variabile | Esempio |
|---|---|---|
| Host | `SMTP_HOST` | il server SMTP del tuo fornitore |
| Porta | `SMTP_PORT` | `587` (STARTTLS) o `465` (TLS) |
| Sicurezza | `SMTP_SECURE` | `true` per la porta 465, `false` per la 587 |
| Utente | `SMTP_USER` | di solito l'indirizzo completo della casella |
| Password | `SMTP_PASSWORD` | la password della casella o una password per le app |
| Dominio del mittente | `EMAIL_DOMAIN` | il dominio dopo la `@` del mittente |

Le email partono da `noreply@<EMAIL_DOMAIN>` (`EMAIL_FROM_LOCAL` cambia la parte prima della `@`). La casella con cui
ti autentichi deve poter inviare come quell'indirizzo: con la maggior parte dei fornitori, usa un indirizzo dello
stesso dominio.

Host, porta e sicurezza sono nella pagina delle impostazioni del tuo fornitore ("SMTP", "posta in uscita" o
"configurazione del client di posta"). Alcune note:

- **Google Workspace**: con la verifica in due passaggi attiva, accedi con una *password per le app* generata
  nell'account Google, non con la password normale; oppure usa il servizio di inoltro SMTP dalla console di
  amministrazione di Workspace. Workspace ha limiti di invio giornalieri per utente: confrontali con il numero di
  candidati a cui scrivi.
- **Microsoft 365**: l'autenticazione SMTP (SMTP AUTH) deve essere attiva per la casella (in molti tenant è spenta di
  default); la attiva l'amministratore dall'interfaccia di amministrazione di Microsoft 365.
- **Aruba, Register.it, OVH e gli altri provider di hosting**: server di posta in uscita, porta e sicurezza della
  casella sono nella guida del fornitore per configurare un client di posta. Usa gli stessi valori.

Una casella aziendale va bene per un piccolo team. Se scrivi a molti candidati ogni giorno, un servizio transazionale
tiene questi messaggi separati dalla reputazione della normale posta aziendale.

## Resend

1. Crea un account su [resend.com](https://resend.com) e una chiave API con il permesso di invio.
2. Aggiungi e verifica in Resend il dominio del mittente, meglio un sottodominio dedicato come `mail.example.com`:
   Resend mostra i record DNS da pubblicare.
3. Durante l'installazione scegli `resend`, incolla la chiave (`RESEND_API_KEY`) e indica lo stesso dominio del
   mittente (`EMAIL_DOMAIN`).

Con Resend, ogni organizzazione può anche inviare da un indirizzo del proprio dominio: nell'app, in Impostazioni,
Email, inserisce l'indirizzo e la pagina mostra i record DNS da pubblicare e il loro stato (`pending`, `verified`,
`failed`). Finché il dominio non è verificato, le email partono dall'indirizzo dell'installazione. Con SMTP le email
partono sempre dall'indirizzo dell'installazione.

## Recapito: SPF, DKIM, DMARC

Qualunque sia il fornitore, la posta arriva in casella solo se il dominio di invio è configurato. Dal tuo gestore DNS:

- **SPF**: un record TXT sul dominio di invio che include il fornitore (`v=spf1 include:<fornitore> ~all`). Un dominio
  ha un solo record SPF: se esiste già, aggiungi il fornitore a quello.
- **DKIM**: i record mostrati dalla verifica del dominio (Resend) o generati dal tuo fornitore SMTP.
- **DMARC**: un record TXT `_dmarc`. Parti con `v=DMARC1; p=none; rua=mailto:dmarc@tuo-dominio`, leggi i report per
  qualche settimana, poi passa a `quarantine`.
- Usa un **sottodominio dedicato** (`mail.example.com`) per la posta transazionale, così un problema di reputazione
  non tocca mai la posta aziendale.

Se invii dalla casella aziendale, SPF e DKIM di quel dominio di solito sono già a posto.

Dopo ogni modifica DNS, manda una prova alla tua casella o a un servizio di verifica come mail-tester.

## Risposte dei candidati (email in arrivo)

I messaggi ai candidati partono con un indirizzo di risposta `reply+<token>@<EMAIL_INBOUND_DOMAIN>`. Quando un
candidato risponde, la risposta viene collegata alla sua scheda nell'app. Serve un fornitore che riceva la posta per
quel dominio e la inoltri a Candydati:

1. Scegli un dominio per le risposte, per esempio `reply.example.com`, e imposta `EMAIL_INBOUND_DOMAIN` con
   `candydati config`.
2. Punta il suo record MX all'host di ricezione del tuo fornitore.
3. Configura il fornitore perché chiami la tua installazione per ogni messaggio ricevuto:
   - **Resend**: `https://<tuo dominio>/api/v1/inbound/email/resend`, con il segreto di firma del webhook di Resend
     (`whsec_...`) come `INBOUND_WEBHOOK_SECRET`.
   - **Qualsiasi altro fornitore** che possa inviare il messaggio grezzo: `https://<tuo dominio>/api/v1/inbound/email/raw`,
     firmato con HMAC-SHA256 di `<timestamp>.<body>` usando `INBOUND_WEBHOOK_SECRET`, la firma nell'header
     `x-candydati-signature` e il timestamp unix in secondi in `x-candydati-timestamp`. Un timestamp più vecchio di 5
     minuti, o più avanti di 1 minuto, viene rifiutato.

Ogni messaggio porta quell'indirizzo di risposta, quindi configuralo prima di scrivere ai candidati: senza, le loro
risposte non arrivano a nessuno. Una semplice casella SMTP non può chiamare un webhook: se invii via SMTP, usa per il
dominio delle risposte un fornitore che offre la ricezione delle email (Resend la offre).
