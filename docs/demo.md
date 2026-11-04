# Demo data

A demo instance with an empty organization shows little: the pipeline, the reports and the candidate profiles need
people in them, and the AI features need a model. The demo seed fills **one** organization with realistic Italian data,
including the outputs the product stores from a model, so the instance can be shown before anyone applies.

It is meant for demo and trial instances. Every person in it is invented: names are random combinations of common
Italian names, addresses are on `demo.example.com` (reserved, RFC 2606: nothing sent there reaches anyone).

## Run it

The seed is built into the `api` image (`dist/demo-seed/cli.js`) and uses the container's own `DATABASE_URL` and `S3_*`.
Create the organization first (sign up as the first owner), note its slug (it is in the careers page address,
`/careers/<slug>`), then:

```sh
# Docker Compose (docs/deploy/docker-compose.md): first without --yes, to read what it will create
docker compose -f docker-compose.prod.yml exec api node dist/demo-seed/cli.js --org <slug>
docker compose -f docker-compose.prod.yml exec api node dist/demo-seed/cli.js --org <slug> --yes
```

**Dokploy** (docs/deploy/dokploy.md): open the compose service, then the terminal of its `api` container (the same
place where the backups doc runs `backup.sh once`), and run

```sh
node dist/demo-seed/cli.js --org <slug>          # prints the plan, writes nothing
node dist/demo-seed/cli.js --org <slug> --yes    # writes it
```

or, over SSH on the server (with several stacks on the server, add `--filter label=com.docker.compose.project=<appName>`):

```sh
docker exec -it $(docker ps -q --filter label=com.docker.compose.service=api) node dist/demo-seed/cli.js --org <slug> --yes
```

`DEMO_SEED_ORG=<slug>` and `DEMO_SEED=1` can replace `--org` and `--yes`.

Safety:

- It touches only the organization given by slug or id, and refuses to run without one.
- Without `--yes` (or `DEMO_SEED=1`) it prints the plan and writes nothing; with it, it prints the plan first.
- Rerunning it never duplicates anything: every row it creates has an id derived from the organization and the row, and
  a rerun adds only what is missing ("Nothing to do" when all is there). Dates are relative to the first run.
- It stops before writing anything if a candidate or a job of the organization that the seed did not create uses one of
  its addresses or slugs.
- Everything is written in one transaction (CVs are uploaded just before it), and every change is in the audit log as a
  `system` action with `demoSeed: true` in its metadata.
- The careers page is **replaced** by the demo page (the plan says so); everything else is added next to what exists.

## What it creates

- **Five job ads** in Italian, with salary in clear, the declared process with its stages, who runs them and the response
  days: Backend Developer and Product Designer (published), Data Engineer (published for a client), Customer Success
  Manager (closed, with a hire: offer accepted and start dates) and Frontend Developer (a complete draft).
- **Hiring setup on the ads:** restricted stages (the final interview of Backend, the team stage of Designer), scorecard
  criteria, stage interviewers (the owner and two external people), automation rules (an email template on entering a
  stage, a task for the job owner) and three custom email templates.
- **40 candidates**, one application each, spread over the stages, with a generated PDF CV, consent to the privacy
  notice, the stage history and the response promises (a few are past their deadline, so the attention list has work).
  Some carry tags, some are in the talent pool.
- **Notes** (one at a restricted stage), **interview feedback** in words (answers, recommendation, scorecard observations
  with evidence: never a score) and **tasks** for the owner, one late and one done.
- **Recruiting for clients** turned on, a client ("Ambulatori Aurora") with two contacts, the Data Engineer job linked to
  it and a **shortlist** of three people sent to a contact, two of them already answered.
- **A careers page** with real sections: hero, who we are, numbers, what we offer, how we select, a testimonial and the
  open positions. No uploaded media.
- **A privacy notice**, only if the organization has none (publishing needs one). It says it is an example: publish
  your own before receiving real applications.

## AI outputs without a model

The seed stores what the product keeps from a model, so the demo shows it with no model configured:

- **CV extraction** of every application (headline, city, years, experiences, education, skills, languages): shown on
  each profile next to the CV, and searchable.
- **The quality score of each published ad**: a recorded model answer replayed through the product's analyzer
  (`@candydati/ad-quality`), so the rules and the merge are the real ones. It scores the ad, never a candidate.

What it never stores: any score, rank or match about a candidate (PRODUCT.md §2.4). The feedback describes, the client
answers "meet" or "not for us" with a reason.

By design (PRODUCT.md §4.3) the ad quality score is shown only while a model is configured. To make the score and the
assistant live (side panel, ad drafting, scorecard suggestions), set a model in **Settings, AI** (or `AGENT_MODEL` and
`FAST_MODEL`, docs/ENVIRONMENT.md) with a key that has a **spending cap** set at the provider: a demo is clicked by
people you do not control.

## Emails

The seed sends nothing. The worker sends no reminders for the demo feedback requests or the shortlist. What people do
afterwards works as usual: moving a demo candidate runs the job's automations and the candidate emails go to
`demo.example.com`, where they reach no one (with a real email provider they show as failed).
