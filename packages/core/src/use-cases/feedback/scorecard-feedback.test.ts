import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors.js';
import { fakePdfBytes, ORG_A, seedHrWorld, userActor, type TestHrDeps } from '../../testing/index.js';
import { moveApplication } from '../candidates/move-application.js';
import { exportCandidate } from '../privacy/export-candidate.js';
import { setJobInterviewers } from './interviewers.js';
import { listApplicationFeedback } from './list-feedback.js';
import { getFeedbackRequest, submitFeedback } from './public.js';
import { setJobScorecard } from './scorecard.js';

const recruiter = userActor({ id: 'recruiter_1', role: 'recruiter', organizationId: ORG_A });
const ANSWERS = { answers: { tech_shown: 'Solid design sense', tech_open: 'Concurrency' }, recommendation: 'proceed' as const };
const PANEL = [{ kind: 'external', email: 'eva@partner.example', name: 'Eva External' }, { kind: 'external', email: 'ugo@partner.example', name: 'Ugo Other' }] as const;

const secretsOf = (deps: TestHrDeps): string[] => deps.sender.sent().flatMap((mail) => [...mail.text.matchAll(/\/feedback\/([a-z]+)/g)].map((m) => m[1] as string));

/** A job with three criteria (one for every stage, one per stage), and two interviewers asked at `stage-1`. */
async function world() {
  const deps = seedHrWorld();
  const scorecard = await setJobScorecard(deps, recruiter, {
    jobId: 'job_1',
    criteria: [{ label: 'Postgres experience' }, { label: 'Client communication', stageId: 'stage-0' }, { label: 'English B2', stageId: 'stage-1' }],
  });
  await setJobInterviewers(deps, recruiter, { jobId: 'job_1', stages: [{ stageId: 'stage-1', interviewers: [...PANEL] }] });
  await deps.files.put(deps.store.read().applications[0]?.cv?.key ?? '', fakePdfBytes(), 'application/pdf');
  await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
  const [pg, , en] = scorecard.criteria;
  return { deps, secrets: secretsOf(deps), pg: pg!.id, en: en!.id };
}

describe('scorecards in the feedback form and on the candidate', () => {
  it('shows the criteria of the stage on the form without login, with the three words and no scale', async () => {
    const { deps, secrets } = await world();
    const view = await getFeedbackRequest(deps, { token: secrets[0]! });
    expect(view.criteria.map((c) => c.label)).toEqual(['Postgres experience', 'English B2']);
    expect(view.observations).toEqual(['observed', 'not_observed', 'to_explore']);
  });

  it('wants evidence for every criterion, then locks their words and keeps the label written against', async () => {
    const { deps, secrets, pg, en } = await world();
    const missing = submitFeedback(deps, { token: secrets[0]!, ...ANSWERS, observations: [{ criterionId: pg, observation: 'observed', evidence: 'Index design' }] });
    await expect(missing).rejects.toBeInstanceOf(ValidationError);
    const scored = submitFeedback(deps, { token: secrets[0]!, ...ANSWERS, observations: [{ criterionId: pg, observation: 'observed', evidence: 'x', score: 5 }] });
    await expect(scored).rejects.toBeInstanceOf(ValidationError);
    await submitFeedback(deps, {
      token: secrets[0]!,
      ...ANSWERS,
      observations: [
        { criterionId: pg, observation: 'observed', evidence: 'Explained index choices on a real schema' },
        { criterionId: en, observation: 'to_explore', evidence: 'Short answers only' },
      ],
    });
    expect(deps.feedbackStore.read().criteria.filter((c) => c.firstUsedAt !== null).map((c) => c.id).toSorted()).toEqual([pg, en].toSorted());
    expect((await getFeedbackRequest(deps, { token: secrets[0]! })).submission?.observations).toHaveLength(2);
    await expect(setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: pg, label: 'Renamed' }] })).rejects.toBeInstanceOf(ValidationError);
    expect(deps.auditLog.events().find((e) => e.action === 'feedback.submitted')?.metadata).toMatchObject({ observations: 2 });
    expect(JSON.stringify(deps.auditLog.events())).not.toContain('index choices');
  });

  it('shows the criteria with each interviewer’s evidence side by side, with no count or total, and exports it', async () => {
    const { deps, secrets, pg, en } = await world();
    const send = (token: string, pgWord: 'observed' | 'not_observed', note: string) =>
      submitFeedback(deps, { token, ...ANSWERS, observations: [{ criterionId: pg, observation: pgWord, evidence: note }, { criterionId: en, observation: 'observed', evidence: `${note} in English` }] });
    await send(secrets[0]!, 'observed', 'Tuned a slow query');
    await send(secrets[1]!, 'not_observed', 'Did not come up');
    await setJobScorecard(deps, recruiter, { jobId: 'job_1', criteria: [{ id: en, label: 'English B2', stageId: 'stage-1' }] });
    const view = await listApplicationFeedback(deps, recruiter, { applicationId: 'app_1' });
    expect(view.scorecard.map((row) => [row.label, row.entries.map((e) => [e.interviewerName, e.observation, e.evidence])])).toEqual([
      ['English B2', [['Eva External', 'observed', 'Tuned a slow query in English'], ['Ugo Other', 'observed', 'Did not come up in English']]],
      ['Postgres experience', [['Eva External', 'observed', 'Tuned a slow query'], ['Ugo Other', 'not_observed', 'Did not come up']]],
    ]);
    expect(JSON.stringify(view.scorecard)).not.toMatch(/"(score|rating|total|count|rank)"/);
    const exported = await exportCandidate(deps, recruiter, { candidateId: 'cand_1' });
    expect(exported.json.applications[0]?.feedback.flatMap((f) => f.observations ?? []).map((o) => o.evidence)).toContain('Tuned a slow query');
  });
});
