import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildApplication,
  buildCandidate,
  buildExtraction,
  buildNote,
  createInMemoryUserDirectory,
  fakePdfBytes,
  seedCandidateWorld,
  userActor,
  ORG_A,
  ORG_B,
} from '../../testing/index.js';
import { addCandidateNote } from './add-candidate-note.js';
import { getCandidate } from './get-candidate.js';
import { openCv } from './open-cv.js';
import { searchCandidates } from './search-candidates.js';
import { updateCandidateTags } from './update-candidate-tags.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A, id: 'user_rec' });
const outsider = userActor({ role: 'owner', organizationId: ORG_B });
const ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer'] as const;

const world = () =>
  seedCandidateWorld({
    candidates: [
      buildCandidate({ organizationId: ORG_A, tags: ['go'] }),
      buildCandidate({ id: 'cand_2', organizationId: ORG_A, firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil', talentPool: true }),
      buildCandidate({ id: 'cand_3', organizationId: ORG_B, firstName: 'Ada', email: 'ada@other.org' }),
    ],
    applications: [
      buildApplication({ organizationId: ORG_A }),
      buildApplication({ id: 'app_2', candidateId: 'cand_2', organizationId: ORG_A, createdAt: new Date('2026-03-01T00:00:00Z') }),
    ],
    notes: [buildNote({ organizationId: ORG_A, authorId: 'user_rec' })],
    extractions: [buildExtraction({ organizationId: ORG_A, text: 'Kubernetes and Rust' }), buildExtraction({ applicationId: 'app_2', organizationId: ORG_A, text: 'COBOL mainframes' })],
    overrides: { users: createInMemoryUserDirectory({ user_rec: 'Rita Recruiter' }) },
  });

describe('searchCandidates', () => {
  const ids = async (input: object, actor = recruiter) => (await searchCandidates(world(), actor, input)).items.map((i) => i.candidate.id);

  it('lists the organization candidates, most recently applied first, with counts', async () => {
    const page = await searchCandidates(world(), recruiter, {});
    expect(page).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(page.items.map((i) => i.candidate.id)).toEqual(['cand_2', 'cand_1']);
    expect(page.items[0]).toMatchObject({ applicationCount: 1, lastAppliedAt: new Date('2026-03-01T00:00:00Z') });
  });

  it('searches name, email, tags and CV text, case-insensitively', async () => {
    expect(await ids({ query: 'hopper' })).toEqual(['cand_2']);
    expect(await ids({ query: 'ADA@EXAMPLE' })).toEqual(['cand_1']);
    expect(await ids({ query: 'GO' })).toContain('cand_1');
    expect(await ids({ query: 'kubernetes' })).toEqual(['cand_1']);
    expect(await ids({ query: 'cobol mainframes' })).toEqual(['cand_2']);
    expect(await ids({ query: 'nothing here' })).toEqual([]);
  });

  it('filters by tag and talent pool, and treats a blank query as no filter', async () => {
    expect(await ids({ tag: ' Go ' })).toEqual(['cand_1']);
    expect(await ids({ talentPool: true })).toEqual(['cand_2']);
    expect(await ids({ talentPool: false })).toEqual(['cand_1']);
    expect(await ids({ query: '   ' })).toHaveLength(2);
  });

  it('paginates and validates', async () => {
    const page = await searchCandidates(world(), recruiter, { page: 2, limit: 1 });
    expect(page.items.map((i) => i.candidate.id)).toEqual(['cand_1']);
    expect(page.total).toBe(2);
    for (const bad of [{ page: 0 }, { limit: 101 }, { limit: 0 }, { talentPool: 'yes' }]) {
      await expect(searchCandidates(world(), recruiter, bad)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('never returns candidates of another organization, and is not audited', async () => {
    const d = world();
    expect((await searchCandidates(d, recruiter, { query: 'ada' })).items.map((i) => i.candidate.id)).toEqual(['cand_1']);
    expect((await searchCandidates(d, outsider, {})).total).toBe(1);
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it.each(ROLES)('allows %s', async (role) => {
    await expect(searchCandidates(world(), userActor({ role, organizationId: ORG_A }), {})).resolves.toBeDefined();
  });
});

describe('getCandidate', () => {
  it('returns the profile with applications, stages, extraction and notes with author names, and audits the view', async () => {
    const d = world();
    const view = await getCandidate(d, recruiter, { candidateId: 'cand_1' });
    expect(view.candidate.id).toBe('cand_1');
    expect(view.applications).toHaveLength(1);
    expect(view.applications[0]?.stages.map((s) => s.id)).toEqual(['received', 'stage-0', 'stage-1']);
    expect(view.applications[0]?.job).toMatchObject({ id: 'job_1', slug: 'backend' });
    expect(view.applications[0]?.extraction?.status).toBe('done');
    expect(view.notes).toEqual([{ note: expect.objectContaining({ id: 'note_1' }), authorName: 'Rita Recruiter' }]);
    expect(d.auditLog.events()).toHaveLength(1);
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'candidate.viewed', target: { type: 'candidate', id: 'cand_1' }, metadata: {} });
  });

  it('shows a placeholder for an author who left', async () => {
    const d = seedCandidateWorld({ notes: [buildNote({ organizationId: ORG_A, authorId: 'gone' })] });
    expect((await getCandidate(d, recruiter, { candidateId: 'cand_1' })).notes[0]?.authorName).toBe('Former member');
  });

  it('answers 404 for another organization and writes no audit event', async () => {
    const d = world();
    await expect(getCandidate(d, outsider, { candidateId: 'cand_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCandidate(d, recruiter, { candidateId: 'cand_3' })).rejects.toBeInstanceOf(NotFoundError);
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it.each(ROLES)('allows %s and audits', async (role) => {
    const d = world();
    await getCandidate(d, userActor({ role, organizationId: ORG_A }), { candidateId: 'cand_1' });
    expect(d.auditLog.events()).toHaveLength(1);
  });
});

describe('updateCandidateTags', () => {
  it('replaces the tags lowercased and unique, returns the profile and audits without the tag values', async () => {
    const d = world();
    const view = await updateCandidateTags(d, recruiter, { candidateId: 'cand_1', tags: [' Senior ', 'senior', 'Remote'] });
    expect(view.candidate.tags).toEqual(['senior', 'remote']);
    expect((await d.candidates.findById(ORG_A, 'cand_1'))?.tags).toEqual(['senior', 'remote']);
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'candidate.updated', metadata: { fields: ['tags'], tagCount: 2 } });
    expect(JSON.stringify(d.auditLog.events()[0]?.metadata)).not.toContain('senior');
  });

  it('validates tags and hides other organizations', async () => {
    for (const tags of [[''], ['x'.repeat(41)], Array.from({ length: 21 }, (_v, i) => `t${i}`), 'go']) {
      await expect(updateCandidateTags(world(), recruiter, { candidateId: 'cand_1', tags })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(updateCandidateTags(world(), outsider, { candidateId: 'cand_1', tags: [] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([['owner', true], ['admin', true], ['recruiter', true], ['hiring_manager', true], ['interviewer', false]] as const)('role %s allowed=%s', async (role, ok) => {
    const run = updateCandidateTags(world(), userActor({ role, organizationId: ORG_A }), { candidateId: 'cand_1', tags: ['x'] });
    if (ok) await expect(run).resolves.toBeDefined();
    else await expect(run).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('addCandidateNote', () => {
  it('stores the note with the author, returns the name and audits ids only', async () => {
    const d = world();
    const view = await addCandidateNote(d, recruiter, { candidateId: 'cand_1', body: '  Call back  ', applicationId: 'app_1' });
    expect(view).toMatchObject({ authorName: 'Rita Recruiter', note: { body: 'Call back', authorId: 'user_rec', applicationId: 'app_1', organizationId: ORG_A } });
    expect(d.auditLog.events()[0]).toMatchObject({
      action: 'candidate_note.created',
      target: { type: 'candidate_note', id: view.note.id },
      metadata: { candidateId: 'cand_1', applicationId: 'app_1' },
    });
    expect(JSON.stringify(d.auditLog.events())).not.toContain('Call back');
  });

  it('attributes agent notes to the user they act for', async () => {
    const view = await addCandidateNote(world(), { ...userActor({ organizationId: ORG_A }), type: 'agent', id: 'agent_x', onBehalfOfUserId: 'user_rec' }, { candidateId: 'cand_1', body: 'hi' });
    expect(view.note.authorId).toBe('user_rec');
  });

  it('refuses empty, oversized, foreign candidates and applications of someone else', async () => {
    for (const body of ['   ', 'x'.repeat(5001)]) {
      await expect(addCandidateNote(world(), recruiter, { candidateId: 'cand_1', body })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(addCandidateNote(world(), outsider, { candidateId: 'cand_1', body: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addCandidateNote(world(), recruiter, { candidateId: 'cand_1', body: 'x', applicationId: 'app_2' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addCandidateNote(world(), recruiter, { candidateId: 'cand_1', body: 'x', applicationId: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(ROLES)('allows %s', async (role) => {
    await expect(addCandidateNote(world(), userActor({ role, organizationId: ORG_A }), { candidateId: 'cand_1', body: 'x' })).resolves.toBeDefined();
  });
});

describe('openCv', () => {
  const withFile = async () => {
    const d = world();
    await d.files.put('organizations/org_test/applications/app_1/cv', fakePdfBytes(), 'application/pdf');
    return d;
  };

  it('returns the original bytes with file name and media type, and audits the download', async () => {
    const d = await withFile();
    const file = await openCv(d, recruiter, { applicationId: 'app_1' });
    expect(file).toEqual({ bytes: fakePdfBytes(), fileName: 'cv.pdf', mediaType: 'application/pdf' });
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'candidate.cv_downloaded', target: { type: 'application', id: 'app_1' } });
  });

  it('answers 404 across organizations, audits nothing when the file is missing, and allows every role', async () => {
    const d = await withFile();
    await expect(openCv(d, outsider, { applicationId: 'app_1' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(openCv(world(), recruiter, { applicationId: 'app_1' })).rejects.toThrow();
    for (const role of ROLES) await expect(openCv(d, userActor({ role, organizationId: ORG_A }), { applicationId: 'app_1' })).resolves.toBeDefined();
  });
});
