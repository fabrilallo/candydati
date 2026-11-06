# Agentic sourcing

Most ATSs wait for applicants. Sourcing tools go looking for people, but they sell you a database, score everyone and
leave the privacy paperwork to you. In Candydati the assistant goes looking for people for a job, inside the ATS you
already use. It shows you why each person might fit, one fact at a time, and lets you choose. The law on informing
people found this way (GDPR art. 14) is handled by the product.

## How it works

On a job, ask the assistant something like *"Find backend engineers in Turin like Giulia"*. Each step shows in the chat:

1. **Criteria first.** The assistant reads the job, and the reference person if you name one. It proposes objective,
   job-related criteria (skills, role, years of experience, city or remote) and waits for you to confirm or change them.
2. **How many.** You choose how many people to look at (10 by default).
3. **The search.** It looks on [GitHub](#sources), on [LinkedIn through your own browser](#linkedin-the-risk-plainly)
   and, through an outside agent, [anywhere an MCP client can reach](#sources).
4. **Evidence, not scores.** For each person you see the first name, the city and, for each criterion, a fact from the
   profile and where it was found ("Go: 4 years at a payments company, Experience"). People appear in the order they were
   found and are never ranked. Anyone already a contact or a candidate is flagged. People who asked not to be contacted
   are left out.
5. **You choose.** Only the people you confirm are added, as **contacts of the job** (the *Sourced* tab), never as
   candidates. They become candidates only if they apply.
6. **You write to them.** *Notice text* gives you the lines to paste into your first message, with a personal link to the
   privacy notice. Nobody is ever messaged automatically.

## Sources

| Source | How it works | What you need |
|---|---|---|
| GitHub | The server searches public accounts: languages of their own repositories, location, words in the bio | Nothing. `GITHUB_TOKEN` raises GitHub's rate limits ([environment variables](https://github.com/fabrilallo/candydati/blob/main/docs/ENVIRONMENT.md)) |
| LinkedIn | The [Chrome extension](./chrome-extension) reads people search and profiles in a visible tab of **your** Chrome, with **your** account | An admin turns it on and sets the maximum per search; you accept the account risk once |
| Outside agents | Claude (with its browser), Claude Code or any MCP client add what they found with `add_sourced_contacts`; the `source_people` prompt guides them ([API and MCP](./api)) | An API key with `sourcing:manage`, or Claude connected as a connector |
| By hand | *Add contact* on the job's *Sourced* tab | Nothing |

No paid data provider and no shared database of profiles. Everything stays on your server.

## What makes it different

- **No ranking, ever.** The assistant shows facts per criterion. It never says who is better, never compares people and
  never rejects anyone. Decisions about people stay with a person ([no automated decisions](./ai)).
- **Contacts are not candidates.** A sourced person did not apply. They sit on the job as a contact until they apply
  through the normal form, with their own consent.
- **The notice is built in (GDPR art. 14).** Every contact has a personal link to a page that shows everything kept
  about them and where it came from, with one button to erase it. The link goes with your first message. Owners and
  admins can also choose to email it at once when an address is public.
- **Erased if nobody writes.** Contacts nobody writes to are erased after 30 days.
- **"Don't contact me" is permanent.** A person who objects is erased and only an encrypted fingerprint is kept, so
  nobody in the organization can add them again.
- **The model never sees who they are.** The assistant reads first name, city and facts. Surnames, profile links,
  handles and emails are removed from what it reads and travel only as encrypted references that the server opens when
  you add the person ([privacy by design](./ai#privacy-by-design)).
- **Read-only on LinkedIn.** The extension never sends connection requests, messages or likes. If LinkedIn shows a
  check (CAPTCHA), it stops and leaves it to you: it never gets around it.
- **Audited.** Adding, writing to, erasing and objecting all end up in the audit log, with counts and never names.

## LinkedIn: the risk, plainly

LinkedIn's terms of use forbid the automated reading of profiles, and LinkedIn may ask the account owner to verify, or
restrict or block the account. Candydati reads LinkedIn only in your browser, with your account, so the risk is on your
personal account. That is why:

- it is **off by default**: an owner or admin turns on *Sourcing on LinkedIn* and sets the most profiles one search may
  read (Settings, Privacy);
- each person **accepts the risk once**, with the date and the version of the text recorded in the audit log, and gets a
  one-line reminder at each search; a new version of the text asks again;
- the search runs in a **visible tab group** named "Candydati": close it to stop.

If that is not for you, leave it off: GitHub, outside agents and adding by hand work without it.

## Set it up

1. Permissions: owners, admins and recruiters hold `sourcing:manage`. Hiring managers and interviewers do not.
2. The assistant needs a model ([AI assistant](./ai)).
3. For LinkedIn: install the [Chrome extension](./chrome-extension), then turn on *Sourcing on LinkedIn* in Settings,
   Privacy.
4. Optional: in Settings, Privacy, choose whether the notice is also emailed at once when an address is public (off by
   default: the notice goes with the first message).
