import { describe, expect, it } from 'vitest';
import { MAX_STAGES } from '../job/content.js';
import type { MigrationStageMapping } from './batch.js';
import { applyStageChoices, migrationCommitBlockers, migrationPipelines } from './choices.js';

const entry = (jobRef: string, stageRef: string, sourceName: string, type: MigrationStageMapping[number]['type'], title = sourceName) => ({ jobRef, stageRef, sourceName, type, title });

const MAPPING: MigrationStageMapping = [
  entry('j1', 's1', 'Applied', 'other'),
  entry('j1', 's2', 'Colloquio HR', 'hr_interview'),
  entry('j1', 's3', 'HR call', 'screening_call'),
  entry('j2', 's1', 'applied ', 'other'),
  entry('j2', 's2', 'Tech', 'technical_interview'),
];

describe('applyStageChoices', () => {
  it('replaces the entries of the stages named, keeping the source name', () => {
    const result = applyStageChoices(MAPPING, { stages: [{ jobRef: 'j1', stageRef: 's3', type: 'hr_interview', title: 'Colloquio HR' }] });
    expect(result).toEqual({ ok: true, mapping: [MAPPING[0], MAPPING[1], entry('j1', 's3', 'HR call', 'hr_interview', 'Colloquio HR'), MAPPING[3], MAPPING[4]] });
  });

  it('maps every stage with the same normalised source name across jobs in one go, title defaulting to the name given', () => {
    const result = applyStageChoices(MAPPING, { byName: [{ name: 'APPLIED', type: 'received' }] });
    if (!result.ok) throw new Error('refused');
    expect(result.mapping.filter((e) => e.type === 'received').map((e) => `${e.jobRef}/${e.stageRef}:${e.title}`)).toEqual(['j1/s1:APPLIED', 'j2/s1:APPLIED']);
  });

  it('lets a single-stage choice win over a bulk one', () => {
    const result = applyStageChoices(MAPPING, {
      byName: [{ name: 'applied', type: 'screening_call', title: 'Screening' }],
      stages: [{ jobRef: 'j2', stageRef: 's1', type: 'received', title: 'Nuovi' }],
    });
    if (!result.ok) throw new Error('refused');
    expect(result.mapping[0]).toMatchObject({ type: 'screening_call', title: 'Screening' });
    expect(result.mapping[3]).toMatchObject({ type: 'received', title: 'Nuovi' });
  });

  it('refuses unknown stages and names that match nothing, with every problem at once', () => {
    expect(applyStageChoices(MAPPING, { stages: [{ jobRef: 'j1', stageRef: 'nope', type: 'offer', title: 'X' }], byName: [{ name: 'Ghost', type: 'offer' }] })).toEqual({
      ok: false,
      issues: [
        { path: 'stageNames', message: 'unknown_stage_name: Ghost' },
        { path: 'stageMapping', message: 'unknown_stage: j1/nope' },
      ],
    });
  });

  it('changes nothing when no choice is given', () => {
    expect(applyStageChoices(MAPPING, {})).toEqual({ ok: true, mapping: MAPPING });
  });
});

describe('migrationPipelines', () => {
  it('merges stages of a job mapped to the same type and title, in order of first appearance', () => {
    const mapping = [entry('j1', 's1', 'Call', 'screening_call', 'Call'), entry('j1', 's2', 'Tech', 'technical_interview'), entry('j1', 's3', 'call', 'screening_call', ' call ')];
    expect(migrationPipelines(mapping)).toEqual([
      {
        jobRef: 'j1',
        stages: [
          { type: 'screening_call', title: 'Call', stageRefs: ['s1', 's3'] },
          { type: 'technical_interview', title: 'Tech', stageRefs: ['s2'] },
        ],
        received: [],
        unmapped: [],
      },
    ]);
  });

  it('keeps stages with the same type and another title apart, and sets received and unmapped stages aside', () => {
    const [pipeline] = migrationPipelines([entry('j1', 's1', 'A', 'hr_interview'), entry('j1', 's2', 'B', 'hr_interview'), entry('j1', 's3', 'New', 'received'), entry('j1', 's4', '?', 'other')]);
    expect(pipeline?.stages.map((s) => s.title)).toEqual(['A', 'B']);
    expect(pipeline).toMatchObject({ received: ['s3'], unmapped: ['s4'] });
  });
});

describe('migrationCommitBlockers', () => {
  it('is empty when every included stage is mapped and no unfixable error remains', () => {
    const mapping = MAPPING.map((e) => (e.type === 'other' ? { ...e, type: 'received' as const } : e));
    expect(migrationCommitBlockers({ stageMapping: mapping, excludedJobs: [], errors: [] })).toEqual([]);
  });

  it('counts stages still mapped to other in included jobs only', () => {
    expect(migrationCommitBlockers({ stageMapping: MAPPING, excludedJobs: [], errors: [] })).toEqual([{ code: 'stages_unmapped', count: 2 }]);
    expect(migrationCommitBlockers({ stageMapping: MAPPING, excludedJobs: ['j2'], errors: [] })).toEqual([{ code: 'stages_unmapped', count: 1 }]);
  });

  it('refuses a job with more distinct stages than a pipeline holds after merging, and not one that fits once merged', () => {
    const many = Array.from({ length: MAX_STAGES + 1 }, (_, i) => entry('j1', `s${i}`, `Stage ${i}`, 'team_interview'));
    expect(migrationCommitBlockers({ stageMapping: many, excludedJobs: [], errors: [] })).toEqual([{ code: 'too_many_stages', jobRefs: ['j1'] }]);
    const merged = many.map((e) => ({ ...e, title: 'Team' }));
    expect(migrationCommitBlockers({ stageMapping: merged, excludedJobs: [], errors: [] })).toEqual([]);
    expect(migrationCommitBlockers({ stageMapping: many, excludedJobs: ['j1'], errors: [] })).toEqual([]);
  });

  it('keeps the error issues the choices cannot fix, once each, and ignores the mapping ones', () => {
    const blockers = migrationCommitBlockers({ stageMapping: [], excludedJobs: [], errors: ['privacy_notice_missing', 'stage_unmapped', 'too_many_stages', 'privacy_notice_missing'] });
    expect(blockers).toEqual([{ code: 'privacy_notice_missing' }]);
  });
});
