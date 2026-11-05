import { MOVE_PROPOSAL_REASON_MAX } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { agentActor, apiKeyActor, buildApplication, buildMoveProposal, seedHrWorld, userActor, ORG_A } from '../../testing/index.js';
import { seedRestrictedStageWorld } from '../../testing/restricted-stage-world.js';
import { proposeApplicationMove } from './propose-move.js';
import { listMoveProposals } from './proposals.js';

const keyOf = (role: 'recruiter' | 'interviewer' | 'owner' = 'recruiter', scopes: readonly string[] | null = null) =>
  apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'rita', role, ...(scopes ? { scopes: scopes as never } : {}) });
const app = (id: string, connected = false) => ({ ...keyOf(), id, ...(connected ? { type: 'connected_app' as const } : {}) });

const world = (overrides: Parameters<typeof buildApplication>[0] = {}, proposals = [] as ReturnType<typeof buildMoveProposal>[]) =>
  seedHrWorld({ applications: [buildApplication({ organizationId: ORG_A, stageId: 'stage-0', ...overrides })], proposals });

const input = { applicationId: 'app_1', toStageId: 'stage-1', reason: 'Clear answers on Postgres in the first call.' };

describe('proposeApplicationMove', () => {
  it('writes an open proposal for the person behind the key, moves nothing, and is audited', async () => {
    const deps = world();
    const result = await proposeApplicationMove(deps, app('key_1'), input);
    expect(result.created).toBe(true);
    expect(result.proposal).toMatchObject({ status: 'open', fromStageId: 'stage-0', toStageId: 'stage-1', proposedBy: 'rita', source: 'api_key', ruleId: null, reason: input.reason });
    expect((await deps.applications.findById(ORG_A, 'app_1'))?.stageId).toBe('stage-0');
    const event = deps.auditLog.events().find((e) => e.action === 'move_proposal.proposed');
    expect(event).toMatchObject({ actor: { type: 'api_key', id: 'key_1', onBehalfOfUserId: 'rita' }, target: { type: 'move_proposal', id: result.proposal.id } });
    expect(event?.metadata).toMatchObject({ applicationId: 'app_1', from: 'stage-0', to: 'stage-1', created: true, source: 'api_key' });
    expect(JSON.stringify(event?.metadata)).not.toContain('Postgres');
    expect(deps.auditLog.events().map((e) => e.action)).not.toContain('application.moved');
  });

  it('attributes a connected app as such, and shows in the list a person acts on', async () => {
    const deps = world();
    await proposeApplicationMove(deps, app('grant_1', true), input);
    const [view] = await listMoveProposals(deps, userActor({ organizationId: ORG_A, id: 'olivia', role: 'owner' }), {});
    expect(view?.proposal).toMatchObject({ source: 'connected_app', reason: input.reason });
  });

  it('returns the open proposal to the same stage instead of a second one', async () => {
    const deps = world();
    const first = await proposeApplicationMove(deps, app('key_1'), input);
    const again = await proposeApplicationMove(deps, app('key_1'), { ...input, reason: 'Said again' });
    expect(again).toEqual({ proposal: first.proposal, created: false });
    expect(deps.moveProposals.snapshot()).toHaveLength(1);
  });

  it('refuses while another proposal (a rule\'s too) waits for a person', async () => {
    const deps = world({}, [buildMoveProposal({ toStageId: 'received' })]);
    await expect(proposeApplicationMove(deps, app('key_1'), input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('replaces an open proposal that already lapsed', async () => {
    const deps = world({}, [buildMoveProposal({ toStageId: 'received', expiresAt: new Date('2000-01-01T00:00:00Z') })]);
    expect((await proposeApplicationMove(deps, app('key_1'), input)).created).toBe(true);
    expect(deps.moveProposals.snapshot().map((p) => p.status)).toEqual(['expired', 'open']);
  });

  it('only to another stage of the application\'s own job, and only while the application is open', async () => {
    await expect(proposeApplicationMove(world(), app('key_1'), { ...input, toStageId: 'stage-0' })).rejects.toBeInstanceOf(ValidationError);
    await expect(proposeApplicationMove(world(), app('key_1'), { ...input, toStageId: 'nope' })).rejects.toBeInstanceOf(ValidationError);
    await expect(proposeApplicationMove(world({ outcome: 'not_selected' }), app('key_1'), input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('validates the reason: required, capped, plain text without control characters', async () => {
    for (const reason of ['', '   ', 'x'.repeat(MOVE_PROPOSAL_REASON_MAX + 1), 'bad\u0000text']) {
      await expect(proposeApplicationMove(world(), app('key_1'), { ...input, reason })).rejects.toBeInstanceOf(ValidationError);
    }
    const trimmed = await proposeApplicationMove(world(), app('key_1'), { ...input, reason: '  Line one\nline two  ' });
    expect(trimmed.proposal.reason).toBe('Line one\nline two');
  });

  it('needs candidate:propose_move: an interviewer, a key without the scope, or another organization cannot', async () => {
    await expect(proposeApplicationMove(world(), keyOf('interviewer'), input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(proposeApplicationMove(world(), keyOf('owner', ['candidate:read', 'candidate:move']), input)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await proposeApplicationMove(world(), keyOf('owner', ['candidate:propose_move']), input)).created).toBe(true);
    const stranger = apiKeyActor({ organizationId: 'org_b', onBehalfOfUserId: 'bob', role: 'owner' });
    await expect(proposeApplicationMove(world(), stranger, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('needs the same per-job access as a move: a job the person cannot open does not exist for them', async () => {
    const outsider = apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_x', role: 'hiring_manager' });
    await expect(proposeApplicationMove(world(), outsider, input)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records a person or the assistant as the source when they propose', async () => {
    expect((await proposeApplicationMove(world(), userActor({ organizationId: ORG_A, id: 'rita', role: 'recruiter' }), input)).proposal.source).toBe('user');
    expect((await proposeApplicationMove(world(), agentActor({ organizationId: ORG_A, onBehalfOfUserId: 'rita', role: 'recruiter' }), input)).proposal.source).toBe('agent');
  });

  it('keeps the reason given at a restricted stage for those who read that stage', async () => {
    const deps = await seedRestrictedStageWorld();
    const hmKey = apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_1', role: 'hiring_manager' });
    await proposeApplicationMove(deps, hmKey, { applicationId: 'app_1', toStageId: 'stage-0', reason: 'RESTRICTED-REASON' });
    const reasonFor = async (id: string, role: 'owner' | 'recruiter' | 'hiring_manager' | 'interviewer') =>
      (await listMoveProposals(deps, userActor({ organizationId: ORG_A, id, role }), {}))[0]?.proposal.reason;
    expect(await reasonFor('user_test', 'owner')).toBe('RESTRICTED-REASON');
    expect(await reasonFor('hm_1', 'hiring_manager')).toBe('RESTRICTED-REASON');
    expect(await reasonFor('recruiter_1', 'recruiter')).toBeNull();
    expect(await reasonFor('int_1', 'interviewer')).toBeNull();
  });

  describe('notifies the job owner', () => {
    const notices = (deps: ReturnType<typeof world>) => deps.notifications.snapshot().filter((n) => n.kind === 'move_proposed');

    it('tells the job owner who proposed, with ids and source only', async () => {
      const deps = world();
      const { proposal } = await proposeApplicationMove(deps, app('grant_1', true), input);
      expect(notices(deps)).toEqual([
        expect.objectContaining({ userId: 'user_test', applicationId: 'app_1', jobId: 'job_1', payload: { proposalId: proposal.id, toStageId: 'stage-1', source: 'connected_app' } }),
      ]);
      expect(JSON.stringify(notices(deps))).not.toContain('Postgres');
    });

    it('does not tell the proposer themself', async () => {
      const deps = world();
      await proposeApplicationMove(deps, apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'user_test', role: 'owner' }), input);
      expect(notices(deps)).toEqual([]);
    });

    it('sends nothing again when the same proposal is returned', async () => {
      const deps = world();
      await proposeApplicationMove(deps, app('key_1'), input);
      await proposeApplicationMove(deps, app('key_1'), input);
      expect(notices(deps)).toHaveLength(1);
    });

    it('sends nothing when the proposal is refused', async () => {
      const deps = world({}, [buildMoveProposal({ toStageId: 'received' })]);
      await expect(proposeApplicationMove(deps, app('key_1'), input)).rejects.toBeInstanceOf(ConflictError);
      expect(notices(deps)).toEqual([]);
    });

    it('never copies the reason of a restricted stage into the notice', async () => {
      const deps = await seedRestrictedStageWorld();
      const hmKey = apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'hm_1', role: 'hiring_manager' });
      await proposeApplicationMove(deps, hmKey, { applicationId: 'app_1', toStageId: 'stage-0', reason: 'RESTRICTED-REASON' });
      expect(JSON.stringify(deps.notifications.snapshot())).not.toContain('RESTRICTED-REASON');
    });
  });
});
