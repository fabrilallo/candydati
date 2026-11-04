# Recruiting for clients

Staffing and search agencies, headhunters and consultants can run every search for every client in one organization:
one team, one talent pool, one set of templates, and a client on each job. The license allows it for any number of
clients ([LICENSE](https://github.com/fabrilallo/candydati/blob/main/LICENSE), Additional Use Grant): clients pay for
the recruiting work, not for access to the software.

Example: the agency "Selezioni Rossi" runs a backend developer search for Acme and an accountant search for Beta. Both
jobs live in the same organization; the people who applied to either are in the same database.

## Turn it on

An owner or admin opens **Settings / Clients** and turns on **We recruit for clients**. Until then nothing about clients
appears anywhere, and organizations that hire for themselves never see it.

Fill in the **authorization reference** too, for example the protocol number of your authorization from the Ministry of
Labour: Italian law (D.Lgs. 276/2003, art. 9) wants ads for recruitment run for others to name the agency and its
authorization, and never to be anonymous. It is printed on every ad of a client job.

## Clients

A client has a name, an optional website and logo (an https address), and the people at the client who receive
shortlists: name and email. Recruiters, admins and owners create and edit clients; everyone in the organization can see
them. A client you no longer work with is archived: its jobs and history stay, it gets no new job.

## A job for a client

On the job, choose the client and how the ad shows it:

- **Show the client's name**: the ad reads "for Acme", the client is the employer in the structured data that search
  engines and job boards read, and its website is linked.
- **Confidential client**: the ad says the search is for a client of the agency that asked to stay confidential. The
  client's name, website and logo appear nowhere public, not in the page, the feed or the structured data.

Either way the page belongs to your organization, so the agency is always named. There is no third option: an ad never
shows a different company as the employer.

Jobs and **Reports** can be filtered by client: time to hire, funnel and sources for the searches of one client only.

## Shortlists for the client

From a client job, open **Shortlist** and press **New shortlist**:

1. Pick the client contact who receives it.
2. Select the candidates to present. Only people who applied to this job and still wait for an outcome can be chosen.
3. For each one choose what goes: the CV or not, and up to five notes (notes about this application or about the person,
   never about other applications). Email, phone, tags and other applications never go.
4. Add a message if you like, check the summary and send.

The contact receives a personal link by email, valid 14 days, with reminders after 3 and 7 days while someone is
unanswered (each reminder carries a new link; the old one stops working). No account is needed. For each candidate the
client answers **Let's meet at interview** or **Not for us**, with a short reason, once.

Answers show on the shortlist and on each candidate's timeline. They never move a candidate or decide anything: a person
at the agency does that, as with interview feedback. You can revoke a link at any time; answers already given stay.

## What candidates are told

When you send a shortlist, every presented candidate receives an email saying that their profile was presented to the
client, by name, or to "a client company of the agency" when the job is confidential, with what was shared (name, CV,
notes). For a confidential client the email says they can reply to ask which company it is: under the GDPR a person
has the right to know who received their data. The email goes through their conversation, so it shows in the messages and
a reply reaches you.

Update your privacy notice before you start: the template in **Settings / Privacy** covers presenting profiles to
clients once the setting is on. The client receives the data as a separate controller, only for that search; agree it in
writing with each client.

## Security of the link

The link is the only key. Only its hash is stored, it expires, it is revoked with one click, its page is never cached
or indexed, sends no referrer and is rate limited, and the CV opens in a sandbox. The page shows nothing the recruiter did
not choose, and no identifier of anyone else.

## API and agents

The API lists clients and the client of each job, and filters jobs and reports by client. Over MCP, `list_clients` and
the client filter of `list_jobs` and `get_reports` are read only. Managing clients and sending shortlists are a person's
actions: no API key and no assistant can do them.
