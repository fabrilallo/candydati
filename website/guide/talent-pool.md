# Search your database

Most ATSs forget the people who applied last year. In Candydati you look for them first: before you publish again or
pay for a database, check the candidates you already have. The search is a filter on facts you choose. It never ranks
anyone and never decides for you.

## Who is searched

The organization's own candidates, imported or who applied, whose consent covers **future positions** (the talent
pool). People who agreed to one selection only are never included. Nobody outside your database is searched.

## How it works

On a job, open the **Search your database** tab, or press **Find people** on the job's candidates page.

1. **Criteria.** Skills come prefilled from the technologies in the ad. Add or change them, and add languages, minimum
   years of experience, a city or words that must appear in the CV. Every criterion must be met.
2. **Results.** The candidates whose CV meets every criterion, most recent application first, 25 per page. For each
   skill you see how the CV spelled it ("Go" written as "Golang"). Never a score, never a ranking.
3. **CVs nobody could check.** CVs that could not be read, or are not structured yet, are counted and reported, not
   dropped, so a person can look at them.
4. **You decide.** Names are in clear and each result links to the candidate's profile, where you decide what to do. The
   search itself adds nothing and sends nothing.

## With the assistant or an outside agent

Ask the assistant something like *"Who in our database fits this job?"*. It proposes criteria from the job, waits for
your confirmation and runs `find_candidates_by_criteria`, which also looks at the job's own applicants. External agents
over MCP have the same tool ([API and MCP](./api)). Models see candidates by first name and id only
([privacy by design](./ai#privacy-by-design)).

## Rules

- **Facts, not scores.** A filter on criteria a person confirmed; no order by merit ([no automated decisions](./ai)).
- **No protected characteristics.** Criteria about age, sex, origin, religion, family, disability or appearance are
  refused. There is no maximum experience: it works as an age limit.
- **Audited.** Every search records who ran it, for which job, the criteria and the number of results, never who was
  found.
- **Permissions.** Anyone who can read candidates (`candidate:read`) can search.

People outside your database (GitHub, the web) are not searched. That may come in a future hosted version.
