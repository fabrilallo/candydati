import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildApplication, buildCandidate, seedCandidateWorld, userActor, ORG_A, ORG_B } from '../../testing/index.js';
import { decideApplication } from './decide-application.js';
import { decideApplications } from './decide-applications.js';
import { updateHireDates } from './update-hire-dates.js';

const recruiter = userActor({ role: 'recruiter', organizationId: ORG_A });
const world = () =>
  seedCandidateWorld({
    candidates: [buildCandidate({ organizationId: ORG_A })],
    applications: [
      buildApplication({ organizationId: ORG_A }),
      buildApplication({ id: 'app_hired', organizationId: ORG_A, outcome: 'hired', closedAt: new Date('2026-02-01T00:00:00Z') }),
    ],
  });

describe('decideApplication with hire dates', () => {
  it('stores both dates on a hire and audits them', async () => {
    const d = world();
    const result = await decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'hired', offerAcceptedOn: '2026-01-20', startOn: '2026-02-15' });
    expect(result.application).toMatchObject({ outcome: 'hired', offerAcceptedOn: '2026-01-20', startOn: '2026-02-15' });
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'application.decided', metadata: { outcome: 'hired', offerAcceptedOn: '2026-01-20', startOn: '2026-02-15' } });
  });

  it('works without dates, as before', async () => {
    const result = await decideApplication(world(), recruiter, { applicationId: 'app_1', outcome: 'hired' });
    expect(result.application.offerAcceptedOn ?? null).toBeNull();
  });

  it('refuses dates on an outcome other than hired, writing nothing', async () => {
    const d = world();
    await expect(decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'withdrawn', offerAcceptedOn: '2026-01-20' })).rejects.toBeInstanceOf(ValidationError);
    expect((await d.applications.findById(ORG_A, 'app_1'))?.outcome).toBeNull();
  });

  it('refuses an offer before the application date and a start before the offer', async () => {
    const d = world();
    await expect(decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'hired', offerAcceptedOn: '2025-12-31' })).rejects.toBeInstanceOf(ValidationError);
    await expect(decideApplication(d, recruiter, { applicationId: 'app_1', outcome: 'hired', offerAcceptedOn: '2026-02-10', startOn: '2026-02-09' })).rejects.toBeInstanceOf(ValidationError);
    expect((await d.applications.findById(ORG_A, 'app_1'))?.outcome).toBeNull();
  });

  it('refuses dates that are not date-only', async () => {
    await expect(decideApplication(world(), recruiter, { applicationId: 'app_1', outcome: 'hired', startOn: '2026-02-10T10:00:00Z' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('the bulk decision does not take dates', async () => {
    const run = decideApplications(world(), recruiter, { applicationIds: ['app_1'], outcome: 'hired', offerAcceptedOn: '2026-01-20' });
    await expect(run).resolves.toEqual({ decided: 1 });
  });
});

describe('updateHireDates', () => {
  it('sets the dates on a hired application and audits old and new values', async () => {
    const d = world();
    const card = await updateHireDates(d, recruiter, { applicationId: 'app_hired', offerAcceptedOn: '2026-01-25', startOn: '2026-03-01' });
    expect(card.application).toMatchObject({ offerAcceptedOn: '2026-01-25', startOn: '2026-03-01' });
    expect(d.auditLog.events()[0]).toMatchObject({
      action: 'application.hire_dates_updated',
      target: { type: 'application', id: 'app_hired' },
      metadata: { offerAcceptedOn: '2026-01-25', startOn: '2026-03-01' },
    });
  });

  it('changes one date and clears the other with null, leaving an absent one alone', async () => {
    const d = world();
    await updateHireDates(d, recruiter, { applicationId: 'app_hired', offerAcceptedOn: '2026-01-25', startOn: '2026-03-01' });
    const card = await updateHireDates(d, recruiter, { applicationId: 'app_hired', startOn: null });
    expect(card.application.offerAcceptedOn).toBe('2026-01-25');
    expect(card.application.startOn ?? null).toBeNull();
  });

  it('validates the result against the stored dates, not only the input', async () => {
    const d = world();
    await updateHireDates(d, recruiter, { applicationId: 'app_hired', offerAcceptedOn: '2026-01-25' });
    await expect(updateHireDates(d, recruiter, { applicationId: 'app_hired', startOn: '2026-01-24' })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateHireDates(d, recruiter, { applicationId: 'app_hired', offerAcceptedOn: '2025-06-01' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an application that is not hired', async () => {
    await expect(updateHireDates(world(), recruiter, { applicationId: 'app_1', startOn: '2026-03-01' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('hides other organizations and needs the decision permission', async () => {
    await expect(updateHireDates(world(), userActor({ role: 'owner', organizationId: ORG_B }), { applicationId: 'app_hired', startOn: '2026-03-01' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateHireDates(world(), userActor({ role: 'interviewer', organizationId: ORG_A }), { applicationId: 'app_hired', startOn: '2026-03-01' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an empty change', async () => {
    await expect(updateHireDates(world(), recruiter, { applicationId: 'app_hired' })).rejects.toBeInstanceOf(ValidationError);
  });
});
