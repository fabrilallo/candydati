# Gestione quotidiana

L'installer aggiunge il comando `candydati` (in `/usr/local/bin`). Eseguilo con `sudo` da qualsiasi cartella.

| Comando | Cosa fa |
|---|---|
| `candydati status` | i container e il loro stato di salute |
| `candydati logs [servizio]` | segue i log di tutti i servizi, o di uno (`api`, `worker`, `web`, `postgres`, `minio`, `caddy`, `backup`) |
| `candydati update [versione]` | fa un backup, scarica le nuove immagini e riavvia; le migrazioni del database partono da sole |
| `candydati backup` | un backup subito |
| `candydati start` / `candydati stop` | avvia o ferma tutti i servizi (i dati restano; dopo un riavvio del server riparte da solo) |
| `candydati restart` | riavvia tutti i servizi |
| `candydati config` | apre `.env` in `$EDITOR`, poi applica la modifica |
| `candydati version` | la versione installata |
| `candydati help` | l'elenco dei comandi |

## Aggiornamenti

```bash
sudo candydati update            # l'ultima release
sudo candydati update 1.2.0      # una versione precisa
```

L'aggiornamento fa prima un backup, poi scarica le nuove immagini e ricrea i servizi. L'api applica le migrazioni
all'avvio. Le migrazioni sono additive e non si possono annullare: se una nuova versione non va, di solito la
precedente funziona sul database migrato, perché ignora le colonne nuove (`candydati update <versione precedente>`).
Se i dati si sono danneggiati, ripristina il backup fatto prima dell'aggiornamento (più sotto).

Leggi il [changelog](https://github.com/fabrilallo/candydati/blob/main/CHANGELOG.md) prima di saltare più versioni.

## Backup

Contano il **database** (tutto, compreso il registro delle azioni) e l'**archivio dei file** (CV ed esportazioni).
Tutto il resto si può ricreare.

- Il database viene salvato **ogni giorno alle 02:30 UTC** (`BACKUP_AT`) e all'avvio del servizio di backup. Ogni dump
  viene verificato, poi conservato per **14 giorni** (`BACKUP_RETENTION_DAYS`) sul server e copiato nell'archivio
  incluso.
- `candydati backup` ne fa uno subito.
- Il servizio di backup risulta non sano in `candydati status` se nessun backup è riuscito nelle ultime 26 ore.

### Copia fuori dal server

Le due copie qui sopra stanno sullo stesso disco: se perdi il server, perdi anche quelle. Manda la copia su qualsiasi
archivio compatibile S3 in un altro posto (l'object storage del tuo provider cloud, AWS S3, Scaleway, Backblaze
B2...) con `candydati config`:

```ini
BACKUP_S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
BACKUP_S3_REGION=eu-central-1
BACKUP_S3_BUCKET=i-miei-backup
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET_KEY=...
# false per gli indirizzi "virtual-hosted", usati dalla maggior parte dei provider cloud
BACKUP_S3_PATH_STYLE=false
```

Per cifrare ogni dump prima che lasci il server, imposta `BACKUP_ENCRYPTION_PASSPHRASE`. Conserva la passphrase fuori
dai backup, nel tuo gestore di password: senza, non si possono ripristinare.

L'archivio dei file ha bisogno di una copia sua: replica il bucket presso un altro fornitore (per esempio con il client
di MinIO, `mc mirror`), oppure fai snapshot del disco del server presso il tuo provider cloud. Dettagli:
[OPERATIONS.md, Backups and restore](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#backups-and-restore)
(in inglese).

### Ripristino

Un dump si ripristina in un database **nuovo**, si controlla, e solo dopo prende il posto di quello attuale. La
procedura, con i comandi, è in
[OPERATIONS.md, Backups and restore](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#backups-and-restore).
Due cose da sapere:

- Le righe scritte dopo il dump si perdono: con backup giornalieri, fino a un giorno di lavoro.
- Ripristina l'archivio dei file dello stesso momento. Un ripristino può riportare dati che una persona ha chiesto di
  cancellare dopo il backup: ripeti quelle cancellazioni (il registro delle azioni del database ripristinato dice
  quali).

Prova un ripristino una volta, prima di averne bisogno.

## Monitoraggio

- **Disponibilità**: punta un servizio di monitoraggio esterno su `https://<tuo dominio>/api/ready`. Controlla
  database, archivio e coda, e risponde 503 se uno dei tre non va.
- **Log**: `candydati logs`. Ogni servizio scrive JSON strutturato; i segreti negli URL sono mascherati e gli header non
  vengono mai registrati.
- **Metriche** (facoltative): imposta `METRICS_TOKEN` per esporre metriche Prometheus su api e worker, solo sulla rete
  interna.
- **Segnalazione degli errori** (facoltativa): `SENTRY_DSN` e `NUXT_SENTRY_DSN` mandano gli errori del server a
  qualsiasi raccoglitore compatibile con Sentry (Sentry, GlitchTip, Bugsink), senza dati dei candidati.

Non viene mandato nulla da nessuna parte se non lo imposti tu. Dettagli:
[OPERATIONS.md, Monitoring and alerts](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#monitoring-and-alerts).

## Dimensionamento

2 vCPU, 4 GB di RAM e 40 GB di disco bastano per un piccolo team (pochi recruiter, centinaia di candidature al mese).
Il disco cresce con i CV (qualche centinaio di KB ciascuno) e con il registro delle azioni.
