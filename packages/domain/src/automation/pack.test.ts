import { describe, expect, it } from 'vitest';
import type { SelectionStage } from '../job/content.js';
import { automationPackInputSchema, automationPackRuleInputSchema, resolvePackRules, type AutomationPackRule } from './pack.js';

const stage = (id: string, type: SelectionStage['type']): SelectionStage => ({ id, type, durationMinutes: 30, conductedBy: 'recruiter' });
const PROCESS = [stage('hr', 'hr_interview'), stage('tech-1', 'technical_interview'), stage('tech-2', 'technical_interview'), stage('offer', 'offer')];

const rule = (overrides: Partial<AutomationPackRule> = {}): AutomationPackRule => ({
  id: 'r1',
  organizationId: 'org_a',
  packId: 'p1',
  stage: 'technical_interview',
  trigger: { type: 'stage_entered' },
  conditions: {},
  action: { type: 'request_feedback' },
  enabled: true,
  createdBy: 'u1',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...overrides,
});

describe('automationPackRuleInputSchema', () => {
  it('anchors a rule to received or to a stage type, never to a stage id', () => {
    const ok = (value: unknown) => automationPackRuleInputSchema.safeParse(value).success;
    expect(ok({ stage: 'received', action: { type: 'add_tag', tag: 'new' } })).toBe(true);
    expect(ok({ stage: 'technical_interview', action: { type: 'request_feedback' } })).toBe(true);
    expect(ok({ stage: 'stage-0', action: { type: 'request_feedback' } })).toBe(false);
  });

  it('points a proposed move at a stage type that differs from the rule stage', () => {
    const ok = (value: unknown) => automationPackRuleInputSchema.safeParse(value).success;
    expect(ok({ stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'technical_interview' } })).toBe(true);
    expect(ok({ stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'tech-1' } })).toBe(false);
    expect(ok({ stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'hr_interview' } })).toBe(false);
    expect(ok({ stage: 'hr_interview', action: { type: 'propose_move', toStageId: 'received' } })).toBe(false);
  });
});

describe('automationPackInputSchema', () => {
  it('needs a name and keeps the description optional', () => {
    expect(automationPackInputSchema.parse({ name: '  Tech hiring ' })).toEqual({ name: 'Tech hiring', description: '' });
    expect(automationPackInputSchema.safeParse({ name: ' ' }).success).toBe(false);
  });
});

describe('resolvePackRules', () => {
  it('puts a rule on every stage of its type, and received on the received stage', () => {
    const { placed, skipped } = resolvePackRules([rule(), rule({ id: 'r2', stage: 'received', action: { type: 'add_tag', tag: 'new' } })], PROCESS);
    expect(placed.map((p) => [p.rule.id, p.stageId])).toEqual([['r1', 'tech-1'], ['r1', 'tech-2'], ['r2', 'received']]);
    expect(skipped).toEqual([]);
  });

  it('sends a proposed move to the first stage of the target type after the rule stage', () => {
    const move = rule({ id: 'm', stage: 'technical_interview', action: { type: 'propose_move', toStageId: 'offer' } });
    const { placed } = resolvePackRules([move], PROCESS);
    expect(placed.map((p) => [p.stageId, p.action])).toEqual([
      ['tech-1', { type: 'propose_move', toStageId: 'offer' }],
      ['tech-2', { type: 'propose_move', toStageId: 'offer' }],
    ]);
  });

  it('skips a rule whose stage type the job lacks, and a move with no target stage after it', () => {
    const missing = rule({ id: 'x', stage: 'case_study' });
    const backwards = rule({ id: 'b', stage: 'offer', action: { type: 'propose_move', toStageId: 'hr_interview' } });
    const { placed, skipped } = resolvePackRules([missing, backwards], PROCESS);
    expect(placed).toEqual([]);
    expect(skipped).toEqual([
      { ruleId: 'x', reason: 'no_stage', stageId: null },
      { ruleId: 'b', reason: 'no_target_stage', stageId: 'offer' },
    ]);
  });

  it('reports each stage where a proposed move found no target, even when other stages of the type got a copy', () => {
    const process = [stage('tech-1', 'technical_interview'), stage('final', 'final_interview'), stage('tech-2', 'technical_interview')];
    const move = rule({ id: 'm', action: { type: 'propose_move', toStageId: 'final_interview' } });
    const { placed, skipped } = resolvePackRules([move], process);
    expect(placed.map((p) => [p.stageId, p.action])).toEqual([['tech-1', { type: 'propose_move', toStageId: 'final' }]]);
    expect(skipped).toEqual([{ ruleId: 'm', reason: 'no_target_stage', stageId: 'tech-2' }]);
  });

  it('works on stages without explicit ids', () => {
    const { placed } = resolvePackRules([rule()], [{ type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' }]);
    expect(placed.map((p) => p.stageId)).toEqual(['stage-0']);
  });
});
