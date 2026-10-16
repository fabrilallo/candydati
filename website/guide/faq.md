# FAQ

## How much does it cost?

The software is free for your own hiring. You pay for the server (a few euros a month for 2 vCPU and 4 GB RAM at most
cloud providers), for sending email if your provider charges for it, and, only if you turn it on, for the AI model you
choose. There are no per-seat or per-job fees and no reserved features.

## Do I need Cloudflare, or other accounts?

No. You need a server, a domain and an email account for sending. Database, file storage, HTTPS certificates and
backups run on the same server. Cloudflare Turnstile on the application form is an option you can turn on, never a
requirement.

## Can I use it for my clients?

Running it for the hiring of your own organization and its affiliates is allowed. Installing, hosting, supporting or
consulting for **a single organization** that uses it for its own hiring is allowed too. Offering it to third parties
as a hosted service, or including it in a product you sell, needs a commercial license. See
[Introduction, license in plain words](./introduction#license-in-plain-words).

## Where is the data?

On your server, in the country your cloud provider places it. Nothing is sent to the authors of Candydati. Data leaves
the server only towards the providers you configure: your email provider, the AI model provider if enabled, the
off-site backup storage if you set one, an error collector if you set one.

## Can I show my own name instead of Candydati?

Yes. Set `PLATFORM_NAME` (the installer asks for it): the interface and the emails use it.

## Which languages are supported?

The interface is in Italian and English, with a switch at the top of every page. `PLATFORM_DEFAULT_LOCALE` sets the
default.

## Can I import candidates from another tool?

Yes: CVs (also in a ZIP archive) and spreadsheets (CSV, XLSX), with a preview before anything is saved and an undo
afterwards. Imported candidates get a consent reconfirmation email: until they reconfirm they are visible only in the
pipeline of their import, and their data is erased if they do not.

## Can I leave?

Yes. A complete export of the organization in open, documented formats is available at any time, and every candidate's
data can be exported on its own.

## Does the AI decide who gets hired?

No. Neither the assistant nor any automation ranks, scores, moves or rejects candidates: automations can only send a
template or create a task when a person moves an application to a stage. The assistant never writes to a candidate
without a person's confirmation. See [AI assistant](./ai).

## How do I get help?

Open an issue on [GitHub](https://github.com/fabrilallo/candydati/issues). For security issues, use the private flow in
[Security and privacy](./security#reporting-a-vulnerability).
