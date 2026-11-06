import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildJob, seedSourcingWorld, userActor, ORG_A } from '../../testing/index.js';
import { addSourcedContacts, deleteSourcedContact } from './contacts.js';
import { prepareWebResults } from './web.js';

const rita = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const world = () => seedSourcingWorld({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published' })] });
const linkedin = (slug: string, name: string) => ({ url: `https://www.linkedin.com/in/${slug}/`, title: `${name} - Go developer - Acme | LinkedIn`, snippet: `Località: Torino · ${name} writes Go at Acme` });
const QUERY = 'site:linkedin.com/in "Go" Torino';

describe('preparing what a web search found', () => {
  it('turns results into people with the snippet as the fact, one per profile, skipping what is not a person', async () => {
    const deps = world();
    const results = [
      linkedin('giulia-verdi', 'Giulia Verdi'),
      { url: 'https://it.linkedin.com/in/giulia-verdi?trk=1', title: 'Giulia Verdi | LinkedIn', snippet: 'again' },
      { url: 'https://www.linkedin.com/company/acme/', title: 'Acme | LinkedIn', snippet: 'A company' },
      { url: 'https://github.com/rustacean42', title: 'rustacean42 · GitHub', snippet: '' },
      { url: 'https://luca-neri.example/', title: 'Luca Neri — Rust in Milano', snippet: 'Rust talks' },
    ];
    const found = await prepareWebResults(deps, rita, { jobId: 'job_1', query: QUERY, results });
    expect(found.map((f) => [f.person.source, f.person.firstName, f.person.lastName, f.person.location, f.status])).toEqual([
      ['linkedin', 'Giulia', 'Verdi', 'Torino', 'new'],
      ['github', 'GitHub user', null, null, 'new'],
      ['web', 'Luca', 'Neri', null, 'new'],
    ]);
    expect(found[0]?.evidence).toEqual([{ criterion: QUERY, text: 'Località: Torino · Giulia Verdi writes Go at Acme', where: 'Google result' }]);
    expect(found[1]?.evidence).toEqual([]);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'sourcing.web_read', target: { type: 'job', id: 'job_1' }, metadata: { results: 5, people: 3 } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Verdi');
  });

  it('flags who is already a contact and leaves out who asked not to be contacted', async () => {
    const deps = world();
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ firstName: 'Giulia', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/giulia-verdi' }] });
    const [added] = await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ firstName: 'Marco', source: 'linkedin', profileUrl: 'https://www.linkedin.com/in/marco-blu' }] });
    await deleteSourcedContact(deps, rita, { contactId: added!.contactId!, doNotContact: true });
    const found = await prepareWebResults(deps, rita, { jobId: 'job_1', query: 'Go', results: [linkedin('giulia-verdi', 'Giulia Verdi'), linkedin('marco-blu', 'Marco Blu')] });
    expect(found.map((f) => [f.person.firstName, f.status])).toEqual([['Giulia', 'already_contact']]);
  });

  it('checks the job, the permission and the caps', async () => {
    const deps = world();
    await expect(prepareWebResults(deps, rita, { jobId: 'job_x', query: 'Go', results: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(prepareWebResults(deps, rita, { jobId: 'job_1', query: '', results: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(prepareWebResults(deps, rita, { jobId: 'job_1', query: 'Go', results: Array.from({ length: 31 }, () => linkedin('a', 'Anna Blu')) })).rejects.toBeInstanceOf(ValidationError);
    const interviewer = userActor({ id: 'int_1', role: 'interviewer', organizationId: ORG_A });
    await expect(prepareWebResults(deps, interviewer, { jobId: 'job_1', query: 'Go', results: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
