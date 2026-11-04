import { describe, expect, it } from 'vitest';
import type { Actor } from '../actor.js';
import { ORG_A } from '../testing/candidate-seed.js';
import { markersIn, RESTRICTED_STAGE_ACTORS, seedRestrictedStageWorld } from '../testing/restricted-stage-world.js';
import type { TestHrDeps } from '../testing/hr-deps.js';
import { getApplicationTimeline } from '../use-cases/candidates/application-timeline.js';
import { getCandidate } from '../use-cases/candidates/get-candidate.js';
import { addCandidateNote } from '../use-cases/candidates/add-candidate-note.js';
import { getPipeline } from '../use-cases/candidates/get-pipeline.js';
import { listApplicationFeedback } from '../use-cases/feedback/list-feedback.js';
import { exportCandidate } from '../use-cases/privacy/export-candidate.js';
import { createStageRestrictionContext, resolveHiddenStages } from './restricted-stages.js';
import { MissingJobTeamsError } from './job-scope.js';
import { userActor } from '../testing/actors.js';
import { can } from '../authorization.js';

type Read = (deps: TestHrDeps, actor: Actor) => Promise<unknown>;

const notes = (marker: string) => marker.includes('NOTE');
const feedback = (marker: string) => marker.includes('FEEDBACK') || marker === 'Restricted Panel';

/**
 * Every surface that shows notes or feedback of an application, with the markers it can carry; REST, the assistant and
 * MCP call these same use cases. The timeline names who left feedback (the panel marker) but not what they wrote.
 */
const READS: readonly (readonly [string, Read, (marker: string) => boolean])[] = [
  ['getCandidate (profile notes)', (deps, actor) => getCandidate(deps, actor, { candidateId: 'cand_1' }), notes],
  ['listApplicationFeedback', (deps, actor) => listApplicationFeedback(deps, actor, { applicationId: 'app_1' }), feedback],
  ['getApplicationTimeline', (deps, actor) => getApplicationTimeline(deps, actor, { applicationId: 'app_1' }), (marker) => notes(marker) || marker === 'Restricted Panel'],
];

const canExport = (actor: Actor) => can(actor, 'candidate:export');

describe('restricted stages: what each role, key and assistant reads (PRODUCT.md §6.2)', () => {
  it.each(READS)('%s', async (_name, read, carries) => {
    for (const { who, actor, sees } of RESTRICTED_STAGE_ACTORS) {
      const deps = await seedRestrictedStageWorld();
      const shown = markersIn(await read(deps, actor));
      expect({ who, shown: shown.toSorted() }).toEqual({ who, shown: sees.filter(carries).toSorted() });
    }
  });

  it('candidate export: restricted content only for who may read it', async () => {
    for (const { who, actor, sees } of RESTRICTED_STAGE_ACTORS.filter((row) => canExport(row.actor))) {
      const deps = await seedRestrictedStageWorld();
      const bundle = await exportCandidate(deps, actor, { candidateId: 'cand_1' });
      expect({ who, shown: markersIn(bundle.json).toSorted() }).toEqual({ who, shown: [...sees].toSorted() });
    }
  });

  it('the pipeline counts only the notes a person may read: no count of restricted notes', async () => {
    for (const { who, actor, sees } of RESTRICTED_STAGE_ACTORS) {
      const deps = await seedRestrictedStageWorld();
      const pipeline = (await getPipeline(deps, actor, { jobId: 'job_1' })) as { cards: readonly { noteCount: number }[] };
      const expected = sees.filter((marker) => marker.includes('NOTE')).length;
      expect({ who, notes: pipeline.cards[0]?.noteCount }).toEqual({ who, notes: expected });
    }
  });

  it('a stage that is no longer restricted shows everything again; notes without a stage are never restricted', async () => {
    const deps = await seedRestrictedStageWorld();
    const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
    deps.store.write({ notes: [...deps.store.read().notes, { ...deps.store.read().notes[0]!, id: 'note_legacy', stageId: null, authorId: 'hm_1', body: 'LEGACY' }] });
    expect(JSON.stringify(await getCandidate(deps, recruiter, { candidateId: 'cand_1' }))).toContain('LEGACY');
    await deps.jobTeams.unrestrictStage(ORG_A, 'job_1', 'stage-1');
    expect(markersIn(await listApplicationFeedback(deps, recruiter, { applicationId: 'app_1' }))).toContain('RESTRICTED-FEEDBACK-EXT');
  });

  it('a note is written at the stage the application is at: its author reads it, other recruiters do not', async () => {
    const deps = await seedRestrictedStageWorld();
    const writer = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
    const other = userActor({ organizationId: ORG_A, id: 'recruiter_2', role: 'recruiter' });
    const written = await addCandidateNote(deps, writer, { candidateId: 'cand_1', applicationId: 'app_1', body: 'WRITTEN-AT-STAGE-1' });
    expect(written).toMatchObject({ note: { stageId: 'stage-1' }, restricted: true });
    expect(JSON.stringify(await getCandidate(deps, writer, { candidateId: 'cand_1' }))).toContain('WRITTEN-AT-STAGE-1');
    expect(JSON.stringify(await getCandidate(deps, other, { candidateId: 'cand_1' }))).not.toContain('WRITTEN-AT-STAGE-1');
    const forOwner = await getCandidate(deps, userActor({ organizationId: ORG_A, role: 'owner' }), { candidateId: 'cand_1' });
    expect(forOwner.applications[0]?.restrictedStageIds).toEqual(['stage-1']);
    expect(forOwner.notes.filter((note) => note.restricted).map((note) => note.note.id).toSorted()).toEqual([written.note.id, 'note_hm', 'note_int2'].toSorted());
    const general = await addCandidateNote(deps, writer, { candidateId: 'cand_1', body: 'About the person' });
    expect(general).toMatchObject({ note: { stageId: null }, restricted: false });
  });

  it('fails closed without the team repository, and never looks anything up for owners, admins and the system', async () => {
    const recruiter = userActor({ organizationId: ORG_A, id: 'recruiter_1', role: 'recruiter' });
    await expect(resolveHiddenStages(undefined, recruiter)).rejects.toBeInstanceOf(MissingJobTeamsError);
    expect((await resolveHiddenStages(undefined, userActor({ organizationId: ORG_A, role: 'admin' }))).size).toBe(0);
    const ctx = createStageRestrictionContext(undefined, userActor({ organizationId: ORG_A, role: 'owner' }));
    expect(await ctx.visible([1, 2], () => ({ applicationId: 'app_1', stageId: 'stage-1', authorIds: [] }))).toEqual([1, 2]);
  });
});
