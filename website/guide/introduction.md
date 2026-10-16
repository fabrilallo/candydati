# Introduction

Candydati is an applicant tracking system (ATS) you run on your own server. It is built for small and mid-sized
companies, their recruiters and generalist HR people, and for the candidates who apply through the public careers
pages. Everything that can be done in the interface can also be done by an agent through the API.

The source is public. The rules it applies are code anyone can read, check and improve, and the good practices are built
into the product instead of being left to goodwill.

## Principles

These are not settings. A deployment cannot turn them off.

- **Salary range in clear.** A job ad without a salary range cannot be published. The range is shown in the ad, in the
  structured data and in every feed.
- **Declared selection process.** Stages, who runs them, how long they take and how fast candidates get an answer are
  visible before anyone applies. The stages declared in the ad become the stages of the pipeline.
- **Every application gets an answer.** Each application carries a response promise ("answer within N days") that is
  counted down. An ad with applications still open cannot be closed: a person decides each one first.
- **No automated decisions about candidates.** The product does not rank, score, order or reject people. Quality scores
  evaluate the ad, never candidates.
- **Agentic-ready.** The REST API and the MCP server call the same services as the interface, with the same permissions
  and the same audit log.
- **GDPR by design.** Consent, retention and erasure exist from the first candidate record stored.
- **No lock-in.** A complete export in an open, documented format is available at any time.

The full product definition is in [PRODUCT.md](https://github.com/fabrilallo/candydati/blob/main/docs/PRODUCT.md).

## What you get

- Structured job ads with a publish standard (salary, process, contract, work mode) and Italian compliance checks.
- A careers page with a page builder, structured data (`JobPosting`), an XML feed and a public read-only ads API.
- Applications without registration, with versioned consent.
- A pipeline whose stages are the ones declared in the ad, candidate search, the original CV next to the extracted data.
- Organizations, roles and per-job selection teams; interview feedback through personal links, without an account.
- Email templates, single and bulk sends, inbound replies attached to the candidate.
- Reports: time to hire, conversion per stage, sources, response times.
- Retention, automatic erasure, data subject rights, an append-only audit log, imports with preview and undo.
- A REST API with OpenAPI, API keys, signed webhooks, an MCP server and an optional process assistant.

Italian and English are available in the interface. The project is pre-1.0: see the
[changelog](https://github.com/fabrilallo/candydati/blob/main/CHANGELOG.md).

## License in plain words

Candydati is released under the [Business Source License 1.1](https://github.com/fabrilallo/candydati/blob/main/LICENSE).

- **You may** run it in production for the hiring of your own organization and its affiliates, for free, with every
  feature. Candidates, interviewers and other external people using it does not change that.
- **You may** install, host, support or consult for a single organization that runs it for its own hiring.
- **You may not**, without a commercial license, offer it to third parties as a hosted service (an ATS, recruiting
  software or careers page service), or include it in a product you sell.
- Each version becomes **AGPL-3.0** four years after it is first published.

The license text is the reference: this summary does not replace it.

## What it costs to run

| Item | Typical cost |
|---|---|
| A Linux server (2 vCPU, 4 GB RAM, 40 GB disk) | a few euros a month at most cloud providers |
| A domain | you probably have one already: a subdomain such as `ats.example.com` is enough |
| Sending email | free tiers of transactional providers, or the company mailbox you already pay for |
| AI (optional) | pay per use at the model provider you choose; off by default |

Everything else (database, file storage, HTTPS certificates, backups) runs on the same server and is included.

Next: [Quick start](./quick-start).
