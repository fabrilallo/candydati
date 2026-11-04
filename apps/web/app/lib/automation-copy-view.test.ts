import { describe, expect, it } from 'vitest'
import { makeJob } from '~~/test/fixtures/job-fixtures'
import { copyInput, stageOptions } from './automation-copy-view'

const t = (key: string): string => key

describe('copyInput', () => {
  it('copies one rule or a whole stage to this job, another job or a template', () => {
    expect(copyInput('j1', { kind: 'rule', ruleId: 'r1', stageId: 's1' }, { kind: 'this_job', holderId: '', stageId: 's2' })).toEqual({
      from: { jobId: 'j1', ruleIds: ['r1'] },
      to: { jobId: 'j1', stageId: 's2' },
    })
    expect(copyInput('j1', { kind: 'stage', stageId: 's1' }, { kind: 'other_job', holderId: 'j2', stageId: 's1' })).toEqual({
      from: { jobId: 'j1', stageId: 's1' },
      to: { jobId: 'j2', stageId: 's1' },
    })
    expect(copyInput('j1', { kind: 'stage', stageId: 's1' }, { kind: 'template', holderId: 't1', stageId: 'x' })).toEqual({
      from: { jobId: 'j1', stageId: 's1' },
      to: { templateId: 't1', stageId: 'x' },
    })
  })

  it('is null until the target is chosen', () => {
    expect(copyInput('j1', { kind: 'stage', stageId: 's1' }, { kind: 'this_job', holderId: '', stageId: '' })).toBeNull()
    expect(copyInput('j1', { kind: 'stage', stageId: 's1' }, { kind: 'other_job', holderId: '', stageId: 's1' })).toBeNull()
  })
})

describe('stageOptions', () => {
  it('names the stages of the content and leaves out the one excluded', () => {
    const content = makeJob({ content: { ...makeJob().content, process: [{ id: 'a', title: 'Primo', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }] } }).content
    const all = stageOptions(content, t)
    expect(all.some((stage) => stage.id === 'a' && stage.label === 'Primo')).toBe(true)
    expect(stageOptions(content, t, 'a').some((stage) => stage.id === 'a')).toBe(false)
  })
})
