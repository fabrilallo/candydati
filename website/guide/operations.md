# Day-to-day operations

The installer adds the `candydati` command (in `/usr/local/bin`). Run it with `sudo` from any folder.

| Command | What it does |
|---|---|
| `candydati status` | containers and their health |
| `candydati logs [service]` | follows the logs of every service, or of one (`api`, `worker`, `web`, `postgres`, `minio`, `caddy`, `backup`) |
| `candydati update [version]` | takes a backup, downloads the new images and restarts; database migrations run automatically |
| `candydati backup` | one backup now |
| `candydati start` / `candydati stop` | starts or stops every service (data stays; after a reboot it starts by itself) |
| `candydati restart` | restarts every service |
| `candydati config` | opens `.env` in `$EDITOR`, then applies the change |
| `candydati version` | the installed version |
| `candydati help` | the list of commands |

## Updates

```bash
sudo candydati update            # the latest release
sudo candydati update 1.2.0      # a specific version
```

The update takes a backup first, then pulls the new images and recreates the services. The api applies migrations at
start. Migrations are additive and have no down step: if a new version misbehaves, the previous one usually runs on the
migrated database, since it ignores the new columns (`candydati update <previous version>`). If data was damaged,
restore the backup taken before the update (below).

Read the [changelog](https://github.com/fabrilallo/candydati/blob/main/CHANGELOG.md) before updating across several
versions.

## Backups

What matters is the **database** (everything, including the audit log) and the **file storage** (CVs and exports).
Everything else can be recreated.

- The database is dumped **every day at 02:30 UTC** (`BACKUP_AT`) and when the backup service starts. Each dump is
  checked, then kept for **14 days** (`BACKUP_RETENTION_DAYS`) on the server and copied into the bundled storage.
- `candydati backup` takes one now.
- The backup service reports itself unhealthy in `candydati status` when no backup succeeded in 26 hours.

### Off-site copy

Both copies above live on the same disk: if the server is lost, so are they. Point the copy at any S3-compatible
storage in another place (your cloud provider's object storage, AWS S3, Scaleway, Backblaze B2...) with
`candydati config`:

```ini
BACKUP_S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
BACKUP_S3_REGION=eu-central-1
BACKUP_S3_BUCKET=my-offsite-backups
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET_KEY=...
# false for virtual-hosted style URLs, as most cloud providers use
BACKUP_S3_PATH_STYLE=false
```

To encrypt every dump before it leaves the server, set `BACKUP_ENCRYPTION_PASSPHRASE`. Keep the passphrase outside the
backups, in your password manager: without it they cannot be restored.

The file storage needs its own copy: mirror the bucket to another provider (for example with the MinIO client,
`mc mirror`), or take snapshots of the server's disk at your cloud provider. Details:
[OPERATIONS.md, Backups and restore](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#backups-and-restore).

### Restore

A dump is restored into a **new** database, checked, and only then put in place of the current one. The procedure,
with the commands, is in
[OPERATIONS.md, Backups and restore](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#backups-and-restore).
Two things to know:

- Rows written after the dump are lost: with daily backups, up to a day of work.
- Restore the file storage from the same moment. A restore can bring back data a person asked to erase after the
  backup: run those erasures again (the audit log of the restored database tells which).

Test a restore once, before you need it.

## Monitoring

- **Uptime**: point an external monitor at `https://<your domain>/api/ready`. It checks the database, the storage and
  the queue, and answers 503 if any of them fails.
- **Logs**: `candydati logs`. Every service writes structured JSON; secrets in URLs are masked and headers are never
  logged.
- **Metrics** (optional): set `METRICS_TOKEN` to expose Prometheus metrics on the api and the worker, on the internal
  network only.
- **Error reports** (optional): `SENTRY_DSN` and `NUXT_SENTRY_DSN` send server errors to any Sentry-compatible
  collector (Sentry, GlitchTip, Bugsink), without candidate data.

Nothing is sent anywhere unless you set it. Details:
[OPERATIONS.md, Monitoring and alerts](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#monitoring-and-alerts).

## Sizing

2 vCPU, 4 GB RAM and 40 GB disk serve a small team (a few recruiters, hundreds of applications a month). Disk grows
with CVs (a few hundred KB each) and the audit log.
