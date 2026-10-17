# Security and privacy

## What the code enforces

You do not have to remember these: a production instance applies them on its own.

- **Secrets**: the stack refuses to start with example, short or low-entropy secrets. The installer generates them.
- **Transport**: the public address must be `https`, so session cookies are always `Secure`. Certificates are renewed
  automatically.
- **Only the web is exposed**: the database, the storage, the api and the worker stay on an internal network.
- **Accounts**: every account confirms its email before the first sign-in; sign-up is invite-only; failed sign-ins slow
  down further attempts instead of locking the account, and the owner is told after 10 failures. Two-factor
  authentication (TOTP with backup codes) is available to everyone, and owners and admins can require it.
- **Visit counts** of the public ads are aggregate numbers per day, source and campaign: no cookies, no web storage, no
  IP address or user agent stored, and nothing that tells two visitors apart. See [Tracked links](./tracked-links).
- **Isolation**: every query is scoped to one organization; every action is checked against the person's permissions
  and written to an append-only audit log.
- **API keys** always expire and never hold more permissions than their creator.
- **Logs** never carry the secrets of links (password reset, invitations, feedback and consent links) nor headers.
- **Webhooks** never reach private, loopback or cloud metadata addresses, and do not follow redirects.
- **Uploads**: CVs and imports are checked by content, and archives are inflated with a hard cap.

Full list: [SECURITY.md, Secure defaults](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md#secure-defaults-for-self-hosted-instances).

## What stays with you

- Keep the server updated and the firewall closed except for 80, 443 and SSH.
- Keep `/opt/candydati/.env` in a password manager, and an off-site copy of the backups.
- Create the first owner right after the install: until that account is confirmed, the setup link in the logs opens the instance.
- Update Candydati when a release fixes a security issue (`candydati update`).

The operator checklist is in
[OPERATIONS.md](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md#security-checklist-for-operators).

## Reporting a vulnerability

Do not open a public issue. Use the private flow on GitHub: the repository's **Security** tab, then **Report a
vulnerability**. Details and response times: [SECURITY.md](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md).

## Privacy and GDPR

When you self-host, **your company is the data controller**, and there is no processor for the platform itself: you run
it. The providers you choose (server hosting, email, AI model) process data on your behalf and must be appointed as
processors or sub-processors.

What the product does for you:

| Requirement | In the product |
|---|---|
| Privacy notice and consent | versioned text per organization; each application stores the version, date and scope accepted |
| Separate consent scopes | the single selection, or, with a separate optional consent, also the talent pool for future positions |
| Retention | a duration per scope, with an expiry computed on every candidate |
| Automatic erasure | a daily job warns before expiry, then anonymises or deletes, files included |
| Data subject rights | export, correction, erasure and consent withdrawal from the candidate's page |
| Audit log | who saw, changed, exported or deleted what; append-only |
| Data minimisation | no fields for special categories; CV extraction drops photo, date of birth and marital status |
| No automated decisions (art. 22) | nothing ranks, scores or rejects candidates; the assistant writes to a candidate only after a person confirms |
| Export | a ZIP per candidate and an export of the whole organization |

In the app, **Settings, Privacy** shows the record of processing filled in with your organization's data (name,
contact, retention, configured providers).

Templates in Italian for the privacy notice to candidates, the record of processing, the data processing agreement and
the list of sub-processors are in
[docs/legal](https://github.com/fabrilallo/candydati/blob/main/docs/legal/README.md). They are starting points and need
review by a lawyer. What remains with you: checking those documents, deciding whether you need a DPIA or a DPO,
choosing and justifying retention periods, instructing the people who use the platform, and answering data subject
requests within one month.
