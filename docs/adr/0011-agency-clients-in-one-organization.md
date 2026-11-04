# ADR 0011: Agencies keep their clients inside one organization

Status: accepted

## Context

The license lets staffing and search agencies, headhunters and consultants recruit for any number of clients. They need
to know which client each search is for, to show clients the candidates they present and to collect an answer, and to
read their figures per client. Two shapes were possible: one organization per client, or one organization for the
agency with clients inside it. Presenting a candidate to a client also sends personal data outside the organization, and
Italian law regulates how recruitment for others is advertised (D.Lgs. 276/2003, art. 9: no anonymous ads, the agency
and its authorization named).

## Decision

1. **One organization per agency, clients inside it.** One team, one talent pool, one set of templates. A client is a
   row of the organization (`client`, contacts as validated jsonb); a job has at most one client (`job_client`, kept
   apart from the ad so saving an ad never touches it). Everything is behind an organization setting, off by default.
2. **The ad never lies about the employer.** Per job the client is shown by name (it is then the hiring organization in
   the structured data and the company of the feed) or as confidential (nothing about it is public; the agency stands
   there). The careers page is the agency's, so the agency is always named, with its authorization reference.
3. **Shortlists through a personal link, like interview feedback.** Hash-only token, 14-day expiry, reminders that rotate
   the link, revocation, a constant-time check on top of the lookup by hash, no-store, noindex, no-referrer, the CV in a
   CSP sandbox, the feedback rate limit, tokens masked in logs. The page shows only what the recruiter chose; ids of
   items, never of applications or people.
4. **Answers are opinions.** "Meet" or "not for us" with a required reason, once per candidate, on the timeline and the
   audit log; they never move or decide (ADR 0005).
5. **Candidates are told, every time.** Sending a shortlist queues a fixed notice to every presented candidate through
   their conversation, naming the client or saying it is confidential and that they may ask which one. It is part of the
   person's action of sending, not an automatic message of the system or the assistant.
6. **People send, machines read.** `client:manage` and `shortlist:send` are never grantable to API keys or the assistant;
   `client:read` is, and the MCP `list_clients` tool returns no contacts.

## Consequences

Agencies work in one place, and reports, access per job (§6.2), erasure and export cover clients with no new tenancy
concept. A client cannot sign in: what it sees is a page per shortlist, by design. Organizations that want a client to
work in the product itself (its own team and pipeline) should give it its own organization. Whether an authorization
reference is legally required for a given user, and the agreement on data with each client, stay with the operator.
