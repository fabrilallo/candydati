---
name: candydati-deploy
description: Deploys Candydati (the source-available ATS) on the user's own server, through Dokploy's API or, on a fresh server, with the one-command installer; email is configured afterwards from the app. Use when the user wants to "install Candydati", "deploy Candydati", "host Candydati", "self-host the ATS" or "put Candydati on my Dokploy".
---

# Deploy Candydati

You set up a Candydati instance for the user and hand them the link to create its first account. The user does the
minimum: a server with Dokploy and an API key for you. You never see a password: Dokploy generates the secrets, and
email is configured by the user from the app after the first sign-in.

## 1. Ask for access, nothing else

Ask only for **Dokploy's URL and an API key** (Dokploy, Settings, Profile, API/CLI); without Dokploy, see section 4.
Ask nothing else: the name has a default, the domain is the one Dokploy generates (with HTTPS), and email is set by
the user in the app. Move to an own domain only if the user asks (section 5).

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
2. **Create**: `POST project.create {"name":"candydati"}`, take `environment.environmentId`; then
   `POST compose.create {"name":"candydati","environmentId":"...","composeType":"docker-compose"}`, take `composeId`
   and `appName`.
3. **Import the template** (secrets and domain stay for Dokploy to generate). It is the file
   `deploy/dokploy/template.base64` of the latest release; no checkout needed:

   ```bash
   TAG=$(curl -fsSL https://api.github.com/repos/fabrilallo/candydati/releases/latest | python3 -c 'import sys,json;print(json.load(sys.stdin)["tag_name"])')
   curl -fsSL "https://raw.githubusercontent.com/fabrilallo/candydati/$TAG/deploy/dokploy/template.base64" > template.b64
   ```

   Only when the user asked for a name or an own domain: `node scripts/dokploy-template.mjs --name "Acme"
   --domain jobs.example.com > template.b64` (the script is in this skill's folder, or at the same path in the
   repository; Node 24, no dependencies).

   Then `POST compose.import {"composeId":"...","base64":"<content of template.b64>"}`, and
   `POST compose.update {"composeId":"...","isolatedDeployment":true}`.
4. **HTTPS**: `GET domain.byComposeId?composeId=...` gives the domain the import created (service `web`, port 3000);
   note its `host`. `POST domain.update` with its `domainId`, that `host`, `"port":3000`, `"serviceName":"web"`,
   `"domainType":"compose"`, `"https":true`, `"certificateType":"letsencrypt"`. With an own domain, first check that
   it resolves to the server (`dig +short <domain>`); if not, say so and wait.
5. **Deploy**: `POST compose.deploy {"composeId":"..."}`. Poll `GET deployment.allByCompose?composeId=...` every 20
   seconds, at most 15 minutes, until the first item's `status` is `done` or `error`. On `error`, read
   `GET deployment.readLogs?deploymentId=...&tail=200` and see Troubleshooting.
6. **Ready**: poll `https://<host>/api/ready` (at most 5 minutes: the certificate may take a minute) until it answers
   `"status":"ready"`.
7. **First owner link**: `GET docker.getContainersByAppNameMatch?appName=<appName>` gives the containers; take the
   `api` one's `containerId`, then `GET compose.readLogs?composeId=...&containerId=...&tail=500&search=First%20owner%20setup`.
   The line holds `https://<host>/signup?setup#code=...`. Give it to the user only (it opens the instance until the
   first account exists).
8. **Hand over**: give the user the address of the instance and the link; tell them to open it and sign up (they are
   in at once, no email and nothing else to type), create the organization, then **Settings, Email**: choose SMTP or Resend, the sending domain, and "Save and send a test
   email". Until email works, invitations, publishing and applications wait. Remind them to revoke the API key and to
   set up backups (`docs/deploy/dokploy.md`, Backups).

## 3. Rules

- Never print, log or repeat a secret (the generated ones, the setup code in a shared channel). Never ask for an
  email password or API key: the user enters it in the app.
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

## 5. Moving to an own domain later

Point a DNS `A` record at the server, then: `POST domain.update` with the new `host` (HTTPS on, Let's Encrypt), ask
the user to set `PLATFORM_URL=https://<new domain>` in the Environment tab (the sign-in cookies and the links in emails
use it), and `POST compose.deploy`. The old domain stops working at that deploy.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Deploy log: `required variable ... is missing a value` | An empty required variable of the template: import it again only on a new service; else ask the user to fill it in the Environment tab. |
| `api` restarts, log names a variable | The api checks its configuration at start: fix that variable in the Environment tab, redeploy. |
| `/api/ready` times out, browser shows `TRAEFIK DEFAULT CERT` | DNS not pointing at the server yet, or ports 80/443 closed by a firewall. |
| No `First owner setup` line | An account is already confirmed (the bootstrap is closed): people join by invitation. |
