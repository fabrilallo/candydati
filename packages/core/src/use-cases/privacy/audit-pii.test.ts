import { describe, expect, it } from 'vitest';
import { ERASED, KEPT, ORG_A, seedPrivacyData, userActor, type TestPrivacyDeps } from '../../testing/index.js';
import { addCandidateNote } from '../candidates/add-candidate-note.js';
import { decideApplication } from '../candidates/decide-application.js';
import { getCandidate } from '../candidates/get-candidate.js';
import { moveApplication } from '../candidates/move-application.js';
import { openCv } from '../candidates/open-cv.js';
import { updateCandidateTags } from '../candidates/update-candidate-tags.js';
import { sendMessage } from '../messaging/send-message.js';
import { correctCandidate } from './correct-candidate.js';
import { eraseApplication, eraseCandidate } from './erase-candidate.js';
import { exportCandidate } from './export-candidate.js';
import { buildOrganizationExport, openExport, requestOrganizationExport } from './organization-export.js';
import { runRetention } from './run-retention.js';
import { withdrawConsent } from './withdraw-consent.js';

const actor = userActor({ id: 'user_r', role: 'owner', organizationId: ORG_A });
const NEW = { firstName: 'Wanda', lastName: 'Nameson', email: 'wanda.nameson@example.net' };
/** The candidate's current full name: the confirmation a recruiter would type. */
const nameOf = (d: TestPrivacyDeps): string => {
  const c = d.store.read().candidates.find((x) => x.id === 'cand_1');
  return `${c?.firstName ?? ''} ${c?.lastName ?? ''}`;
};

type Step = readonly [string, (deps: TestPrivacyDeps) => Promise<unknown>];

/** Every use case of the candidate lifecycle that writes an audit event. */
const STEPS: readonly Step[] = [
  ['getCandidate', (d) => getCandidate(d, actor, { candidateId: 'cand_1' })],
  ['openCv', (d) => openCv(d, actor, { applicationId: 'app_1' })],
  ['updateCandidateTags', (d) => updateCandidateTags(d, actor, { candidateId: 'cand_1', tags: ['rust'] })],
  ['addCandidateNote', (d) => addCandidateNote(d, actor, { candidateId: 'cand_1', body: `Note about ${ERASED.firstName}` })],
  ['moveApplication', (d) => moveApplication(d, actor, { applicationId: 'app_1', stageId: 'stage-0' })],
  ['decideApplication', (d) => decideApplication(d, actor, { applicationId: 'app_1', outcome: 'not_selected' })],
  ['sendMessage', (d) => sendMessage(d, actor, { applicationIds: ['app_2'], subject: 'Ciao {{ candidate.firstName }}', body: 'Ciao {{ candidate.firstName }} {{ candidate.lastName }}' })],
  ['correctCandidate', (d) => correctCandidate(d, actor, { candidateId: 'cand_1', changes: NEW })],
  ['exportCandidate', (d) => exportCandidate(d, actor, { candidateId: 'cand_1' })],
  ['withdrawConsent (talent_pool)', (d) => withdrawConsent(d, actor, { applicationId: 'app_1', scope: 'talent_pool' })],
  [
    'requestOrganizationExport, build, openExport',
    async (d) => {
      const created = await requestOrganizationExport(d, actor, {});
      await buildOrganizationExport(d, { organizationId: ORG_A, exportId: created.id });
      await openExport(d, actor, { exportId: created.id });
    },
  ],
  ['withdrawConsent (selection)', (d) => withdrawConsent(d, actor, { applicationId: 'app_1', scope: 'selection' })],
  ['eraseApplication', (d) => eraseApplication(d, actor, { applicationId: 'app_2', confirmName: nameOf(d) })],
  ['eraseCandidate', (d) => eraseCandidate(d, actor, { candidateId: 'cand_1', confirmName: nameOf(d) })],
  ['runRetention', (d) => runRetention({ ...d, now: () => new Date('2099-01-01T00:00:00Z') }, { now: new Date('2099-01-01T00:00:00Z') })],
];

const PERSONAL = [ERASED.firstName, ERASED.lastName, ERASED.email, ERASED.phone, NEW.firstName, NEW.lastName, NEW.email, KEPT.firstName, KEPT.lastName, KEPT.email];

describe('audit events never carry personal data', () => {
  it.each(STEPS)('%s', async (_name, run) => {
    const deps = await seedPrivacyData();
    await run(deps);
    const text = JSON.stringify(deps.auditLog.events().map((e) => ({ target: e.target, metadata: e.metadata, actor: e.actor })));
    for (const value of PERSONAL) expect(text.toLowerCase()).not.toContain(value.toLowerCase());
  });

  it('holds for the whole lifecycle run in sequence, and the webhook events carry ids only', async () => {
    const deps = await seedPrivacyData();
    for (const [name, run] of STEPS) {
      try {
        await run(deps);
      } catch (error) {
        // A step may legitimately refuse (the application is already gone, the stage does not exist): audited events still count.
        expect(error, name).toBeInstanceOf(Error);
      }
    }
    const audit = JSON.stringify(deps.auditLog.events());
    const outbox = JSON.stringify(deps.outbox.snapshot());
    for (const value of PERSONAL) {
      expect(audit.toLowerCase()).not.toContain(value.toLowerCase());
      expect(outbox.toLowerCase()).not.toContain(value.toLowerCase());
    }
    expect(deps.auditLog.events().length).toBeGreaterThan(5);
  });
});
