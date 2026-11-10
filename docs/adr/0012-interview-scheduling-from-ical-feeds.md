# ADR 0012: Interviews booked from the interviewers' own iCal feeds

Status: accepted (2026-11-10). Supersedes the line of PRODUCT.md §3.3 that deferred scheduling to an external service.

## Context

Fixing an interview is the slowest back-and-forth of a selection. The product must know every booked interview (when,
with whom, at which stage) to remind people, notify the team, start the stage's automations and later ask for
feedback. Three shapes were possible:

- **An external booking link** (Google booking pages, Microsoft Bookings, Calendly, Cal.com). Cheapest, but the ATS does
  not learn what was booked (Google and Bookings send no webhook), and panels of several interviewers are awkward.
- **Google and Microsoft OAuth.** The best experience, but every self-hosted instance would have to register its own
  OAuth apps, pass Google's verification of the calendar scope and store refresh tokens.
- **The secret iCal address** every calendar already offers (Google "secret address in iCal format", Outlook "publish
  calendar" with availability only, iCloud, Nextcloud), read by the ATS, plus invites sent by email.

## Decision

1. **Busy times from a secret iCal address, per member and organization.** Pasted once by the person (session only,
   never an API key or the assistant). The address is a credential: sealed with its own key (`candydati:calendar-feed`,
   bound to the organization and the person), never sent back, never logged, never given to a model. It is read through
   the SSRF-safe public download (https, public pinned addresses, re-checked redirects, size cap, no credentials sent).
   Only busy intervals inside the booking horizon are stored; titles, descriptions, locations and attendees are dropped
   while parsing. Recurring events are expanded; free and cancelled events are skipped. The feed goes when the person
   leaves the organization or is deleted.
2. **The ATS books.** Free times are each interviewer's working hours minus their busy times and other bookings, on a
   30-minute grid, from one day to two weeks ahead. The candidate picks one on a page without an account and confirms
   with a POST: a time link in an email only preselects (mail scanners open links). Calendars are read again, then the
   time is checked once more under a Postgres advisory lock per interviewer, so nobody is booked twice.
3. **Invites by email (iTIP).** Candidate and interviewers get a `text/calendar` REQUEST with one UID per interview and a
   SEQUENCE raised on every change; a cancellation is a CANCEL. Calendars add, update and remove the event themselves.
4. **Links like the feedback links.** Hash-only tokens; the invitation's link is created when the email is sent; the
   link rotates at each booking; expiry after the interview; the same rate limit, no-store, noindex, no-referrer.
5. **People decide.** Proposing sends a message to a candidate, so it is a person's action: the assistant never proposes
   or books (ADR 0005, PRODUCT.md §5). Bookings notify the team and can start the stage's automations, which never move
   or decide.

## Consequences

- Works on every installation with no configuration; nothing to register with Google or Microsoft.
- A feed is refreshed at most every few minutes and again right before a booking: an event added a minute earlier can
  still be missed. Accepted for interviews.
- No video link is created automatically: the recruiter writes the meeting link, address or phone in the proposal.
- OAuth (Meet/Teams links, writing events directly) stays possible as an option later, by default in a hosted version.
- Busy times of employees are personal data: kept minimal (intervals only), within the horizon, deleted with the person.
