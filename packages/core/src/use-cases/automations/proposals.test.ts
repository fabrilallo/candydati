import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';
import { buildApplication, buildMoveProposal, seedHrWorld, userActor, ORG_A } from '../../testing/index.js';
import { decideApplication } from '../candidates/decide-application.js';
import { moveApplication } from '../candidates/move-application.js';
import { expireMoveProposals } from './expire-proposals.js';
import { confirmMoveProposal, dismissMoveProposal, listMoveProposals } from './proposals.js';

const recruiter = userActor({ organizationId: ORG_A, id: 'rita', role: 'recruiter' });
const interviewer = userActor({ organizationId: ORG_A, id: 'ivo', role: 'interviewer' });
const otherOrg = userActor({ organizationId: 'org_b', id: 'bob', role: 'owner' });

const world = (proposal = buildMoveProposal()) =>
  seedHrWorld({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0' })], proposals: [proposal] });

const actions = (deps: ReturnType<typeof world>) => deps.auditLog.events().map((e) => e.action);

describe('listMoveProposals', () => {
  it('lists live proposals with the candidate, the job and the stage names', async () => {
    const deps = world();
    const [view, ...rest] = await listMoveProposals(deps, recruiter, {});
    expect(rest).toEqual([]);
    expect(view).toMatchObject({ proposal: { id: 'prop_1' }, candidate: { id: 'cand_1' }, job: { id: 'job_1' } });
    expect(view?.toLabel).not.toBeNull();
    expect(await listMoveProposals(deps, recruiter, { applicationId: 'other' })).toEqual([]);
  });

  it('leaves out proposals that expired or whose application moved, and other organizations see nothing', async () => {
    expect(await listMoveProposals(world(buildMoveProposal({ expiresAt: new Date('2000-01-01T00:00:00Z') })), recruiter, {})).toEqual([]);
    expect(await listMoveProposals(world(buildMoveProposal({ fromStageId: 'received' })), recruiter, {})).toEqual([]);
    expect(await listMoveProposals(world(), otherOrg, {})).toEqual([]);
  });
});

describe('confirmMoveProposal', () => {
  it('moves the application through the normal move, in the name of the person who confirms', async () => {
    const deps = world();
    const result = await confirmMoveProposal(deps, recruiter, { proposalId: 'prop_1' });
    expect(result.proposal).toMatchObject({ status: 'confirmed', resolvedBy: 'rita' });
    expect((await deps.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-1');
    expect(actions(deps)).toEqual(expect.arrayContaining(['application.moved', 'move_proposal.confirmed']));
    expect(deps.auditLog.events().find((e) => e.action === 'application.moved')?.actor).toMatchObject({ type: 'user', id: 'rita' });
  });

  it('needs candidate:move: an interviewer cannot confirm or dismiss', async () => {
    const deps = world();
    await expect(confirmMoveProposal(deps, interviewer, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(dismissMoveProposal(deps, interviewer, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a proposal that is no longer live, and another organization finds nothing', async () => {
    await expect(confirmMoveProposal(world(buildMoveProposal({ expiresAt: new Date('2000-01-01T00:00:00Z') })), recruiter, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(ConflictError);
    await expect(confirmMoveProposal(world(buildMoveProposal({ status: 'dismissed' })), recruiter, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(ConflictError);
    await expect(confirmMoveProposal(world(), otherOrg, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('dismissMoveProposal', () => {
  it('closes the proposal, moves nothing, and is audited', async () => {
    const deps = world();
    expect(await dismissMoveProposal(deps, recruiter, { proposalId: 'prop_1' })).toMatchObject({ status: 'dismissed', resolvedBy: 'rita' });
    expect((await deps.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-0');
    expect(actions(deps)).toEqual(['move_proposal.dismissed']);
    await expect(dismissMoveProposal(deps, recruiter, { proposalId: 'prop_1' })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('a proposal does not outlive its application', () => {
  it('is dropped when a person moves the application', async () => {
    const deps = world();
    await moveApplication(deps, recruiter, { applicationId: 'app_1', stageId: 'stage-1' });
    expect(deps.moveProposals.snapshot().map((p) => p.status)).toEqual(['dropped']);
  });

  it('is dropped when the application is decided', async () => {
    const deps = world();
    await decideApplication(deps, recruiter, { applicationId: 'app_1', outcome: 'not_selected' });
    expect(deps.moveProposals.snapshot().map((p) => p.status)).toEqual(['dropped']);
  });

  it('expires after its time, by the hourly job', async () => {
    const deps = world(buildMoveProposal({ expiresAt: new Date('2026-03-01T00:00:00Z') }));
    expect(await expireMoveProposals(deps, { now: new Date('2026-02-28T00:00:00Z') })).toEqual({ expired: 0 });
    expect(await expireMoveProposals(deps, { now: new Date('2026-03-01T00:00:00Z') })).toEqual({ expired: 1 });
    expect(deps.moveProposals.snapshot().map((p) => p.status)).toEqual(['expired']);
  });
});
