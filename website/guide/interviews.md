# Interviews from your calendar

Fixing an interview usually takes a chain of emails. In Candydati the candidate picks a time that is free for every
interviewer, from a link, and everyone gets the event in their calendar. The ATS knows every booked interview, so it can
remind, notify and start your stage's automations.

## Connect your calendar

Each person connects their own calendar once, from **Settings → Calendar**, by pasting its **secret iCal address**:

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

## Your video room

On the same page, under **Your video room**, save once the link you use for interviews: a Google Meet created with
*New meeting → Create a meeting for later*, your Zoom personal room or a recurring Teams meeting. When a video interview
is proposed with no other link, it gets the room of the stage's first interviewer who saved one, so whoever books always
knows where to join. The link goes only to the candidates who book, and is deleted when you leave the organization.

## Propose an interview

On a candidate's profile press **Propose interview** (next to the outcome and the move, from *Received* too): choose the
stage (its interviewers and duration come from the job; the dialog names them), the mode (video, on site, phone) and
where (meeting link, address or phone). For a video interview the interviewer's room is already filled in; if there is
no link at all, the dialog says so before you send.

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
