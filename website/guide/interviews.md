# Interviews from your calendar

Fixing an interview usually takes a chain of emails. In Candydati the candidate picks a time that is free for every
interviewer, from a link, and everyone gets the event in their calendar. The ATS knows every booked interview, so it can
remind, notify and start your stage's automations.

## Connect Google Calendar

If you use Google Calendar and the instance offers it, press **Connect Google Calendar** in **Settings → Calendar** and
accept on Google. That is all:

- **Busy times read from Google:** no secret address to find. Only the busy intervals of your primary calendar, never
  titles, descriptions or attendees.
- **The interview in your calendar:** when a candidate books, the interview appears in the Google Calendar of the
  stage's first interviewer who connected it, as a private event. A video interview without a written link gets a
  **Google Meet of its own**, and the link reaches the candidate and the other interviewers. Moving the interview moves
  the event (the Meet stays); cancelling deletes it.
- **No duplicates:** whoever has the event in their calendar gets the email without the .ics invite. Everyone else gets
  the invite as always.

Working hours and time zone are set in the same box and apply to your iCal address too, if you have one. If Google no
longer accepts the connection (access revoked, password changed), the box says so and asks you to connect again;
meanwhile your iCal address counts, if connected. If Google does not answer at booking, the interview is booked anyway:
the event arrives with the .ics invite, without a Meet. **Disconnect** gives the access back to Google; events already
made stay in your calendar.

### For whoever installs Candydati

The connection uses one Google app for the instance, not one per person. Whoever runs the instance creates it once:

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Google Calendar API**.
2. Set up the **OAuth consent screen**. On Google Workspace choose **Internal**: only your company's people, no Google
   verification. With Gmail accounts or several domains you need **External**, published, and Google's verification of
   the calendar permissions; in *Testing* mode Google expires the connection after 7 days.
3. In **Credentials → Create credentials → OAuth client ID** choose *Web application* and add the redirect URI
   `https://<your domain>/api/v1/me/calendar/google/callback`.
4. Put the client ID and secret in `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` and restart.

Without these two variables the button does not show and everything works with the iCal address.

## Other calendars: the iCal address

With Outlook, iCloud or a Google Calendar that is not connected, each person connects their own calendar once, from
**Settings → Calendar**, by pasting its **secret iCal address**:

- **Google Calendar** (on a computer): gear → *Settings*; in the left column, under *Settings for my calendars*, click
  your name; scroll to *Integrate calendar* and copy *Secret address in iCal format* (it ends with `basic.ics`; not the
  public address). If the field is missing, your Google Workspace admin turned it off for the domain.
- **Outlook / Microsoft 365:** Settings → Calendar → Shared calendars → *Publish a calendar*, choose *Can view when I'm
  busy*, copy the ICS link.
- **iCloud:** share the calendar as public and copy the link (a `webcal://` address works).

Set your working days and hours and your time zone. Only **busy times** of the next two weeks are read: never titles,
descriptions, places or attendees. The address is encrypted and never shown again; it is deleted when you disconnect
or leave the organization. Someone without a connected calendar counts as free during default working hours, and the
recruiter is told.

## Propose an interview

On a candidate's profile press **Propose interview** (next to the outcome and the move, from *Received* too): choose the
stage (its interviewers and duration come from the job; the dialog names them), the mode (video, on site, phone) and
where (meeting link, address or phone). For a video interview you can leave the link empty: if an interviewer connected
Google Calendar, the dialog says the Meet will be made in their calendar at booking; if nobody can make one, it says so
before you send.

The candidate gets an email in their conversation with a personal link and two or three free times on different days.
Opening a time shows it already chosen; nothing is booked until the candidate confirms.

## Booking, moving, cancelling

- **Free times** are everyone's working hours minus their calendars and other booked interviews, on a 30-minute grid,
  from one day to two weeks ahead.
- **No double booking:** at confirmation the calendars are read again and the time is checked once more under a lock.
- **Invites for everyone:** candidate and interviewers get a calendar invite (.ics). Moving updates the same event,
  cancelling removes it. The candidate can move or cancel until 12 hours before.
- **Reminder:** the candidate is reminded the day before.
- **Your team knows:** interviewers and whoever proposed it get a notification in the app. The automation triggers
  *The candidate books the interview* and *The interview is cancelled* start the stage's rules, for example a task to
  prepare the interview.

## Rules

- **People decide.** Proposing writes to a candidate, so a person does it: the assistant never proposes or books.
- **Permissions.** `interview:schedule` (owner, admin, recruiter, hiring manager) to propose and cancel;
  `interview:read` to see them (everyone who reads candidates). Connecting a calendar is personal: never an API key.
- **Audited.** Connecting a calendar, proposing, booking, moving and cancelling are in the audit log, without the
  calendar address.
