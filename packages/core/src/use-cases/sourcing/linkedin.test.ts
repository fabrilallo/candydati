import { LINKEDIN_RISK_TEXT_VERSION } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { agentActor, buildJob, seedSourcingWorld, userActor, ORG_A } from '../../testing/index.js';
import { addSourcedContacts } from './contacts.js';
import { acceptLinkedinRisk, getLinkedinStatus, prepareLinkedinResults, setLinkedinSetting } from './linkedin.js';

const rita = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const owner = userActor({ id: 'user_test', role: 'owner', organizationId: ORG_A });
const world = (linkedin = { enabled: true, maxPerRun: 2 }) => seedSourcingWorld({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A, status: 'published' })], linkedin });
const profile = (slug: string, text = 'Go and Kubernetes at Spotify') => ({ profileUrl: `https://www.linkedin.com/in/${slug}/`, fullName: `${slug} Lind`, headline: 'Backend engineer', location: 'Stockholm, Sweden', text });

describe('LinkedIn sourcing setting and risk', () => {
  it('is off by default; owners turn it on with a cap, people only, audited', async () => {
    const deps = seedSourcingWorld({ jobs: [buildJob({ id: 'job_1', organizationId: ORG_A })] });
    expect(await getLinkedinStatus(deps, rita, {})).toEqual({ enabled: false, maxProfilesPerRun: 20, accepted: false, textVersion: LINKEDIN_RISK_TEXT_VERSION });
    await expect(setLinkedinSetting(deps, rita, { enabled: true, maxProfilesPerRun: 30 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await setLinkedinSetting(deps, owner, { enabled: true, maxProfilesPerRun: 30 })).toEqual({ enabled: true, maxProfilesPerRun: 30 });
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'organization.linkedin_sourcing_updated', metadata: { enabled: true, maxProfilesPerRun: 30 } });
    await expect(setLinkedinSetting(deps, owner, { enabled: true, maxProfilesPerRun: 101 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('each person accepts the current text once, in person, and it is recorded', async () => {
    const deps = world();
    await expect(acceptLinkedinRisk(deps, rita, { textVersion: LINKEDIN_RISK_TEXT_VERSION + 1 })).rejects.toBeInstanceOf(ConflictError);
    await expect(acceptLinkedinRisk(deps, agentActor({ organizationId: ORG_A, role: 'recruiter', onBehalfOfUserId: 'recruiter_1' }), { textVersion: LINKEDIN_RISK_TEXT_VERSION })).rejects.toBeInstanceOf(ForbiddenError);
    await acceptLinkedinRisk(deps, rita, { textVersion: LINKEDIN_RISK_TEXT_VERSION });
    expect((await getLinkedinStatus(deps, rita, {})).accepted).toBe(true);
    expect((await getLinkedinStatus(deps, owner, {})).accepted).toBe(false);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'sourcing.linkedin_risk_accepted', metadata: { textVersion: LINKEDIN_RISK_TEXT_VERSION } });
  });
});

describe('preparing what the extension read', () => {
  it('needs the setting on, the person to have accepted, and at most the cap', async () => {
    const off = world({ enabled: false, maxPerRun: 2 });
    await expect(prepareLinkedinResults(off, rita, { jobId: 'job_1', keywords: ['Go'], profiles: [profile('a')] })).rejects.toBeInstanceOf(ConflictError);
    const deps = world();
    await expect(prepareLinkedinResults(deps, rita, { jobId: 'job_1', keywords: ['Go'], profiles: [profile('a')] })).rejects.toBeInstanceOf(ConflictError);
    await acceptLinkedinRisk(deps, rita, { textVersion: LINKEDIN_RISK_TEXT_VERSION });
    await expect(prepareLinkedinResults(deps, rita, { jobId: 'job_1', keywords: ['Go'], profiles: [profile('a'), profile('b'), profile('c')] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('gives facts per criterion and flags who is already known, leaving out who objected; the audit counts only', async () => {
    const deps = world();
    await acceptLinkedinRisk(deps, rita, { textVersion: LINKEDIN_RISK_TEXT_VERSION });
    await addSourcedContacts(deps, rita, { jobId: 'job_1', contacts: [{ firstName: 'b', source: 'linkedin', profileUrl: 'https://it.linkedin.com/in/b' }] });
    const found = await prepareLinkedinResults(deps, rita, { jobId: 'job_1', keywords: ['Kubernetes'], location: 'Stockholm', profiles: [profile('a'), profile('b')] });
    expect(found.map((f) => [f.firstName, f.lastName, f.status])).toEqual([
      ['a', 'Lind', 'new'],
      ['b', 'Lind', 'already_contact'],
    ]);
    expect(found[0]?.evidence).toEqual([
      { criterion: 'Kubernetes', text: 'Go and Kubernetes at Spotify', where: 'LinkedIn' },
      { criterion: 'Stockholm', text: 'Stockholm, Sweden', where: 'LinkedIn' },
    ]);
    expect(deps.auditLog.events().at(-1)).toMatchObject({ action: 'sourcing.linkedin_read', target: { type: 'job', id: 'job_1' }, metadata: { profiles: 2 } });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('Lind');
  });
});
