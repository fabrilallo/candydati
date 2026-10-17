# Quick start

One server, one command. The installer sets up everything else: database, file storage, HTTPS certificates, daily
backups and the `candydati` command to manage the instance.

## What you need

- **A Linux server**: Ubuntu 22.04 or later, or Debian 12 or later, recommended. `amd64` or `arm64`. At least
  **2 vCPU, 4 GB RAM and 40 GB disk**: enough for a small team (a few recruiters, hundreds of applications a month).
  For example Hetzner Cloud CX23 or CAX11 (Arm), or OVHcloud VPS-1, about €5–7 a month in October 2026 (check the
  current price; we have no affiliation). The stack uses about 850 MB at rest and 1.3 GB under load: 2 GB works for a
  small team without large imports, 4 GB is recommended.
- **Ports 80 and 443 open** to the internet. Keep everything else closed except SSH.
- **A domain name pointing to the server, before you install.** Create a DNS `A` record (and `AAAA` if the server has
  IPv6) for the host name you want, for example `ats.example.com`, with the server's public address. The HTTPS
  certificate is issued automatically by Let's Encrypt through Caddy, and that only works once the name resolves.
- **An email account for sending**: a [Resend](https://resend.com) API key, or the SMTP credentials of any provider,
  including your company mailbox (Google Workspace, Microsoft 365, Aruba, Register.it, OVH...). See [Email](./email).
- **Optional**: an API key of an AI provider, for the [assistant](./ai).

You do not need Cloudflare or any other account.

## Install

Connect to the server over SSH and run:

```bash
curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo bash
```

The installer:

1. installs Docker if it is missing;
2. asks for:
   - the **domain** (for example `ats.example.com`);
   - the **name** shown in the interface and in emails (default `Candydati`);
   - the **administrator's email**;
   - the **default language** (`it` or `en`);
   - the **email provider**: `resend` (API key) or `smtp` (host, port, security, user, password), and the
     the **sender address** (default: the SMTP user when it is an address, otherwise `noreply@<domain>`);
   - **AI**, optional: a model as `provider/model` and its API key. Press Enter to skip;
3. checks that the domain points to this server (a warning only: you can go on);
4. generates every secret and writes them to `/opt/candydati/.env`, readable only by root (`chmod 600`);
5. downloads the images and starts everything, with automatic HTTPS and daily backups;
6. prints the link to create the first account, with the one-time **setup code** already in it.

## Create the first account

1. Open the link printed by the installer (`https://<your domain>/signup?setup#code=...`): the setup code is already
   filled in.
2. Fill in your details: you are signed in at once, no confirmation email.
3. Create your organization.

Sign-up is **invite-only**: from now on people join through invitations sent from the app. The code works only for the
very first account: once that account is confirmed it opens nothing, and there is nothing to remove.

## Check that it works

```bash
candydati status
```

All services should be running and healthy after a minute or two. From any computer,
`https://<your domain>/api/ready` answers with the state of the database, the storage and the queue. Then send yourself
a test email from the app and read [Day-to-day operations](./operations) for updates and backups.

## Install without questions

For automation (cloud-init, Ansible, a script), give the answers as environment variables and set `CANDYDATI_YES=1`.
Use `sudo -E` so the variables reach the installer:

```bash
export CANDYDATI_DOMAIN=ats.example.com
export CANDYDATI_NAME="Example Careers"
export CANDYDATI_ADMIN_EMAIL=hr@example.com
export CANDYDATI_LOCALE=en
export CANDYDATI_EMAIL_PROVIDER=resend
export RESEND_API_KEY=re_...
export CANDYDATI_SENDER=jobs@example.com
export CANDYDATI_YES=1
curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo -E bash
```

| Variable | Meaning |
|---|---|
| `CANDYDATI_DOMAIN` | host name of the instance |
| `CANDYDATI_NAME` | name shown in the interface and in emails (default `Candydati`) |
| `CANDYDATI_ADMIN_EMAIL` | administrator's email |
| `CANDYDATI_LOCALE` | default language: `it` or `en` |
| `CANDYDATI_EMAIL_PROVIDER` | `resend` or `smtp` |
| `RESEND_API_KEY` | with `resend` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | with `smtp` |
| `CANDYDATI_SENDER` | sender address of the emails (written as `EMAIL_FROM_LOCAL` and `EMAIL_DOMAIN`) |
| `AGENT_MODEL`, `FAST_MODEL` and the provider key (for example `OPENAI_API_KEY`) | optional AI, see [AI assistant](./ai) |
| `CANDYDATI_VERSION` | version to install (default: the latest release) |
| `CANDYDATI_DIR` | installation folder (default `/opt/candydati`) |
| `CANDYDATI_YES=1` | never ask: fail if something required is missing |

## Running it again

On a server where Candydati is already installed, the installer changes nothing and tells you to use
`candydati update`. Your configuration and data are never overwritten.

## Keep a copy of the secrets

`/opt/candydati/.env` holds every secret of the instance: the database and storage passwords, the key that signs
sessions, the email credentials. Copy it to your password manager. If you later set a backup encryption passphrase,
keep it there too: without it encrypted backups cannot be restored.
