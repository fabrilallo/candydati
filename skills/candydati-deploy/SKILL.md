---
name: candydati-deploy
description: Deploys Candydati (the source-available ATS) on the user's own server, through Dokploy's API or, on a fresh server, with the one-command installer. Use when the user wants to "install Candydati", "deploy Candydati", "host Candydati", "self-host the ATS" or "put Candydati on my Dokploy".
---

# Deploy Candydati

You set up a Candydati instance for the user and hand them the link to create its first account. The user does the
minimum: a server, a domain, an email provider, and access for you. You never see a password: Dokploy generates the
secrets, and the user pastes their own email password where it is needed.

## 1. Ask everything at once

Ask in one message, and wait for the answers:

1. **Where**: a server with [Dokploy](https://dokploy.com) (its URL and an API key, section 2), or a fresh Linux server
   with SSH access (section 4).
2. **Domain** for the site, for example `jobs.example.com`, with a DNS `A` record pointing at the server. Without a
   domain of their own, `<name>.<ip-with-dashes>.sslip.io` works for a trial (it resolves to that IP by itself).
3. **Name** shown in the app and in emails (default `Candydati`), and a **support email** shown to candidates.
4. **Email provider**, which nothing can replace (every applicant gets an answer): SMTP (host, port, user) or Resend.
   Not the password or the API key: the user pastes it in Dokploy later (step 2.6), never in this chat.

Tell the user what the API key means: it acts as them on Dokploy, and what it returns (the environment of every service
it can see) passes through you and your model provider. Prefer a Dokploy user that sees only this project, and
revoking the key at the end.

## 2. Dokploy

Every call: `curl -sS -H "x-api-key: $DOKPLOY_API_KEY" -H 'Content-Type: application/json' "$DOKPLOY_URL/api/<procedure>"`,
`GET` with query parameters, `POST` with a JSON body. Ask the user to export `DOKPLOY_URL` and `DOKPLOY_API_KEY` in
your shell rather than paste the key in the chat. If Dokploy's UI is not public (port 3000 closed), ask for an SSH
tunnel: `ssh -N -L 3000:localhost:3000 <user>@<server>`, then `DOKPLOY_URL=http://localhost:3000`.

1. **Check access**: `GET settings.getDokployVersion` answers the version. `GET project.all` lists the projects: if one
   is already called `candydati`, stop and ask (never touch another project).
2. **Check DNS**: the domain resolves to the server (`dig +short <domain>`). If not, say so and wait: the HTTPS
   certificate cannot be issued before.
3. **Create**: `POST project.create {"name":"candydati"}`, take `environment.environmentId`; then
   `POST compose.create {"name":"candydati","environmentId":"...","composeType":"docker-compose"}`, take `composeId`
   and `appName`.
4. **Import the template** with the user's answers (secrets stay for Dokploy to generate):

   ```bash
   node scripts/dokploy-template.mjs --domain jobs.example.com --name "Acme" --support-email hr@example.com \
     --email-provider smtp --smtp-host smtp.example.com --smtp-port 587 --smtp-user apikey > template.b64
   ```

   (`--email-provider resend` needs no SMTP flags; `--email-domain` when mail goes out from another domain.) Then
   `POST compose.import {"composeId":"...","base64":"<content of template.b64>"}`, and
   `POST compose.update {"composeId":"...","isolatedDeployment":true}`.
5. **Domain with HTTPS**: `GET domain.byComposeId?composeId=...` gives the domain the import created (service `web`,
   port 3000). `POST domain.update` with its `domainId`, `"host":"<domain>"`, `"port":3000`, `"serviceName":"web"`,
   `"domainType":"compose"`, `"https":true`, `"certificateType":"letsencrypt"`.
6. **The user's email secret**: ask them to open Dokploy, project `candydati`, service `candydati`, **Environment**, and
   fill `SMTP_PASSWORD` (or `RESEND_API_KEY`), then **Save**. Wait for them. Check it without printing any value:
   `GET compose.one?composeId=...` and test only that the line is not empty, for example
   `python3 -c 'import sys,json; e=json.load(sys.stdin)["env"]; print(any(l.startswith(("SMTP_PASSWORD=","RESEND_API_KEY=")) and len(l.split("=",1)[1])>0 for l in e.splitlines()))'`.
7. **Deploy**: `POST compose.deploy {"composeId":"..."}`. Poll `GET deployment.allByCompose?composeId=...` every 20
   seconds, at most 15 minutes, until the first item's `status` is `done` or `error`. On `error`, read
   `GET deployment.readLogs?deploymentId=...&tail=200` and see Troubleshooting.
8. **Ready**: poll `https://<domain>/api/ready` (at most 5 minutes: the certificate may take a minute) until it answers
   `"status":"ready"`.
9. **First owner link**: `GET docker.getContainersByAppNameMatch?appName=<appName>` gives the containers; take the
   `api` one's `containerId`, then `GET compose.readLogs?composeId=...&containerId=...&tail=500&search=First%20owner%20setup`.
   The line holds `https://<domain>/signup?setup#code=...`. Give it to the user only (it opens the instance until the
   first account is confirmed), and tell them: open it, sign up, confirm the email, create the organization.
10. **Close**: remind the user to revoke the API key (Dokploy, Settings, Profile, API/CLI) and to set up backups
    (`docs/deploy/dokploy.md`, Backups).

## 3. Rules

- Never print, log or repeat a secret (the generated ones, the email password, the setup code in a shared channel).
- Never delete a project, a service or a volume, never deploy with `freshVolumes`, never touch another project.
- Never import the template again on a running instance: it generates new secrets that no longer match the data.
  Upgrade by asking the user to set `CANDYDATI_VERSION` (the new release, for example `0.2.0`) in the Environment tab,
  then `compose.deploy`.
- Stop and ask when anything is unexpected. Do not work around a failed check.

## 4. A fresh server (no Dokploy)

The installer does everything (Docker, secrets, HTTPS with Caddy, backups). It asks for the email password itself, so
the user runs it in their own SSH session. Prepare the command with the answers of step 1, for example:

```bash
curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh -o install.sh
sudo CANDYDATI_DOMAIN=jobs.example.com CANDYDATI_NAME="Acme" CANDYDATI_ADMIN_EMAIL=hr@example.com \
  CANDYDATI_EMAIL_PROVIDER=smtp SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=apikey bash install.sh
```

It prompts for what is missing (the password), then prints the first owner link. Ports 80 and 443 must be free: on a
server with Dokploy or another proxy, use section 2.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Deploy log: `required variable ... is missing a value` | An empty required variable: usually `EMAIL_PROVIDER`. Re-run step 4 only on a new service; else ask the user to fill it in the Environment tab. |
| `api` restarts, log names a variable | The api checks its configuration at start: fix that variable in the Environment tab, redeploy. |
| `/api/ready` times out, browser shows `TRAEFIK DEFAULT CERT` | DNS not pointing at the server yet, or ports 80/443 closed by a firewall. |
| No `First owner setup` line | An account is already confirmed (the bootstrap is closed): people join by invitation. |
