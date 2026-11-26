# ADR 0013: Google Calendar through OAuth, next to the iCal feed

Status: accepted (2026-11-12, shipped in 0.9.0). Extends [ADR 0012](0012-interview-scheduling-from-ical-feeds.md),
which left OAuth out.

## Context

With ADR 0012 a member pastes a secret iCal address once, and the interview reaches calendars as an emailed `.ics`.
That address is read-only: the ATS can never create a video meeting, and finding the address is the hardest step for
people. A video interview without a link, or with one room reused for every candidate (0.8.0), lets the wrong person
in. Google Calendar is what most of our users have.

## Decision

1. **Opt-in, per member and organization.** An instance that sets `GOOGLE_CALENDAR_CLIENT_ID` and
   `GOOGLE_CALENDAR_CLIENT_SECRET` offers "Connect Google Calendar" in Settings → Calendar. Without them nothing
   changes. The iCal address keeps working for Outlook, iCloud and everyone else.
2. **Narrowest scopes:** `openid email`, `calendar.freebusy`, `calendar.events.owned`. Authorization code with PKCE,
   offline access, a signed `state` bound to the session user and organization. A missing scope stores nothing.
3. **Only the refresh token is kept**, sealed with its own key (`candydati:calendar-connection`), never logged, never
   returned by the API. Disconnecting revokes it at Google; leaving the organization deletes it.
4. **Busy times through freeBusy** (primary calendar, intervals only), behind the same port as the iCal feed, same cache
   window. A grant Google no longer honours marks the connection broken and asks the person to connect again.
5. **The ATS keeps the booking.** Our page, our lock, our audit, our reminders. Google is told afterwards: a private
   event in the calendar of the stage's first interviewer with Google connected, with a Meet of its own for a video
   interview without a written link; moved and deleted with the interview. `sendUpdates=none`: invites stay ours, and
   that interviewer gets no `.ics` so the event is never there twice.
6. **Google failing never fails a booking.** The emailed invite carries it; the failure is logged with a reason code
   (never a token or Google's answer), a revoked grant marks the connection to reconnect, and who proposed the
   interview and the interviewer whose calendar it is get an in-app notification (`interview_calendar_failed`),
   saying so when a video interview was left without its Meet.
7. **Plain HTTP adapter** in `packages/providers` (no Google SDK), host guard on Google's three hosts, Zod on every
   response. No real Google call in CI.

## Consequences

- Every self-hosted instance registers its own Google OAuth client. On Google Workspace an Internal app needs no
  verification; an External one needs Google's verification of the calendar scopes on a domain the operator owns, and
  in Testing Google ends connections after 7 days (docs/OPERATIONS.md, Google Calendar).
- Google is a tool the organization chooses: it appears in the register of processing (docs/legal).
- Microsoft 365 (Graph, Teams link) can come behind the same ports (PRODUCT.md §3.3).
- The fixed video room of 0.8.0 is removed: each video interview gets its own Meet or the link the recruiter writes.
