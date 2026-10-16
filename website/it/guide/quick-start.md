# Avvio rapido

Un server, un comando. L'installer prepara tutto il resto: database, archivio dei file, certificati HTTPS, backup
giornalieri e il comando `candydati` per gestire l'installazione.

## Cosa ti serve

- **Un server Linux**: consigliati Ubuntu 22.04 o successivo, oppure Debian 12 o successivo. `amd64` o `arm64`. Almeno
  **2 vCPU, 4 GB di RAM e 40 GB di disco**: bastano per un piccolo team (pochi recruiter, centinaia di candidature al
  mese).
- **Le porte 80 e 443 aperte** verso internet. Tieni chiuso tutto il resto tranne SSH.
- **Un nome di dominio che punta al server, prima di installare.** Crea un record DNS `A` (e `AAAA` se il server ha
  IPv6) per il nome che vuoi, per esempio `ats.example.com`, con l'indirizzo pubblico del server. Il certificato HTTPS
  è emesso in automatico da Let's Encrypt tramite Caddy, e funziona solo quando il nome risolve.
- **Un account email per l'invio**: una chiave API di [Resend](https://resend.com), oppure le credenziali SMTP di
  qualsiasi fornitore, compresa la casella aziendale (Google Workspace, Microsoft 365, Aruba, Register.it, OVH...).
  Vedi [Email](./email).
- **Facoltativo**: una chiave API di un fornitore di AI, per l'[assistente](./ai).

Non servono Cloudflare né altri account.

## Installa

Collegati al server via SSH ed esegui:

```bash
curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo bash
```

L'installer:

1. installa Docker se manca;
2. chiede:
   - il **dominio** (per esempio `ats.example.com`);
   - il **nome** mostrato nell'interfaccia e nelle email (predefinito `Candydati`);
   - l'**email dell'amministratore**;
   - la **lingua predefinita** (`it` o `en`);
   - il **fornitore email**: `resend` (chiave API) o `smtp` (host, porta, sicurezza, utente, password), e il
     l'**indirizzo mittente** (predefinito: l'utente SMTP se è un indirizzo, altrimenti `noreply@<dominio>`);
   - l'**AI**, facoltativa: un modello nella forma `fornitore/modello` e la sua chiave API. Premi Invio per saltare;
3. controlla che il dominio punti a questo server (solo un avviso: puoi proseguire);
4. genera tutti i segreti e li scrive in `/opt/candydati/.env`, leggibile solo da root (`chmod 600`);
5. scarica le immagini e avvia tutto, con HTTPS automatico e backup giornalieri;
6. stampa il link per creare il primo account e il **token di setup** monouso.

## Crea il primo account

1. Apri `https://<tuo dominio>/signup?setup`.
2. Inserisci i tuoi dati e incolla nel campo **Setup token** il token stampato dall'installer.
3. Conferma il tuo indirizzo email con il link che ricevi.
4. Crea la tua organizzazione.

La registrazione è **solo su invito**: da qui in poi le persone entrano con gli inviti mandati dall'app. Il token vale
solo per il primissimo account. Quando quell'account è confermato non apre più nulla; toglilo comunque con
`candydati config` (cancella la riga `BOOTSTRAP_TOKEN`, salva, e la modifica viene applicata).

## Controlla che funzioni

```bash
candydati status
```

Dopo un minuto o due tutti i servizi devono essere avviati e sani. Da qualsiasi computer,
`https://<tuo dominio>/api/ready` risponde con lo stato del database, dell'archivio e della coda. Poi mandati
un'email di prova dall'app e leggi [Gestione quotidiana](./operations) per aggiornamenti e backup.

## Installare senza domande

Per l'automazione (cloud-init, Ansible, uno script), passa le risposte come variabili d'ambiente e imposta
`CANDYDATI_YES=1`. Usa `sudo -E` perché le variabili arrivino all'installer:

```bash
export CANDYDATI_DOMAIN=ats.example.com
export CANDYDATI_NAME="Lavora con noi"
export CANDYDATI_ADMIN_EMAIL=hr@example.com
export CANDYDATI_LOCALE=it
export CANDYDATI_EMAIL_PROVIDER=resend
export RESEND_API_KEY=re_...
export CANDYDATI_SENDER=jobs@example.com
export CANDYDATI_YES=1
curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo -E bash
```

| Variabile | Significato |
|---|---|
| `CANDYDATI_DOMAIN` | nome host dell'installazione |
| `CANDYDATI_NAME` | nome mostrato nell'interfaccia e nelle email (predefinito `Candydati`) |
| `CANDYDATI_ADMIN_EMAIL` | email dell'amministratore |
| `CANDYDATI_LOCALE` | lingua predefinita: `it` o `en` |
| `CANDYDATI_EMAIL_PROVIDER` | `resend` o `smtp` |
| `RESEND_API_KEY` | con `resend` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | con `smtp` |
| `CANDYDATI_SENDER` | indirizzo mittente delle email (scritto come `EMAIL_FROM_LOCAL` ed `EMAIL_DOMAIN`) |
| `AGENT_MODEL`, `FAST_MODEL` e la chiave del fornitore (per esempio `OPENAI_API_KEY`) | AI facoltativa, vedi [Assistente AI](./ai) |
| `CANDYDATI_VERSION` | versione da installare (predefinita: l'ultima release) |
| `CANDYDATI_DIR` | cartella di installazione (predefinita `/opt/candydati`) |
| `CANDYDATI_YES=1` | non chiede mai nulla: si ferma se manca qualcosa di obbligatorio |

## Se lo esegui di nuovo

Su un server dove Candydati è già installato, l'installer non cambia nulla e ti dice di usare `candydati update`. La
configurazione e i dati non vengono mai sovrascritti.

## Conserva una copia dei segreti

`/opt/candydati/.env` contiene tutti i segreti dell'installazione: le password del database e dell'archivio, la chiave
che firma le sessioni, le credenziali email. Copialo nel tuo gestore di password. Se in seguito imposti una passphrase
di cifratura dei backup, conservala lì: senza, i backup cifrati non si possono ripristinare.
