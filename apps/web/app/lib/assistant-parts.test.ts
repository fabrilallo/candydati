import { describe, expect, it } from 'vitest'
import { completeContent } from '~~/test/fixtures/job-fixtures'
import { assistantItems, isAgentNotConfigured, stepLabelKey, type PartLike } from './assistant-parts'

const message = (parts: readonly PartLike[]) => ({ role: 'assistant', parts })
const tool = (name: string, state: string, output?: unknown, id = `call-${name}`) => ({ type: `tool-${name}`, toolCallId: id, state, input: {}, output })

describe('assistantItems', () => {
  it('keeps text, drops an identical repeat and the empty ones', () => {
    const items = assistantItems(message([{ type: 'step-start' }, { type: 'text', text: 'Ciao' }, { type: 'text', text: '  ' }, { type: 'reasoning', text: 'hmm' }, { type: 'text', text: 'Ciao' }]))
    expect(items).toEqual([{ kind: 'text', text: 'Ciao' }])
  })

  it('groups consecutive tool calls into one list of steps with their state', () => {
    const items = assistantItems(
      message([
        tool('get_job', 'output-available', { id: 'j1' }),
        tool('analyze_job_ad', 'input-available'),
        { type: 'dynamic-tool', toolName: 'mystery', toolCallId: 'd1', state: 'output-error', errorText: 'x' },
        { type: 'text', text: 'Fatto.' },
        tool('list_attention', 'input-streaming', undefined, 'c2'),
      ]),
    )
    expect(items).toEqual([
      {
        kind: 'steps',
        steps: [
          { id: 'call-get_job', tool: 'get_job', state: 'done' },
          { id: 'call-analyze_job_ad', tool: 'analyze_job_ad', state: 'running' },
          { id: 'd1', tool: 'mystery', state: 'failed' },
        ],
      },
      { kind: 'text', text: 'Fatto.' },
      { kind: 'steps', steps: [{ id: 'c2', tool: 'list_attention', state: 'running' }] },
    ])
  })

  it('turns a finished draft_message into a draft card after its step', () => {
    const output = { status: 'draft_not_sent', applicationId: 'a1', subject: 'Grazie', body: 'Ciao {{candidate.firstName}}', unknownVariables: [] }
    const items = assistantItems(message([tool('draft_message', 'output-available', output)]))
    expect(items).toEqual([
      { kind: 'steps', steps: [{ id: 'call-draft_message', tool: 'draft_message', state: 'done' }] },
      { kind: 'draft_message', id: 'call-draft_message', draft: output },
    ])
  })

  it('turns a finished draft_job_content into a proposal card', () => {
    const [, card] = assistantItems(message([tool('draft_job_content', 'output-available', { proposal: completeContent, saved: false, publishIssues: [] })]))
    expect(card).toMatchObject({ kind: 'draft_job', draft: { saved: false, proposal: { title: 'Backend developer' } } })
  })

  it('shows a draft whose output does not validate only as a failed step', () => {
    const items = assistantItems(message([tool('draft_message', 'output-available', { error: { code: 'forbidden', message: 'no' } }), tool('draft_job_content', 'output-available', { title: '' })]))
    expect(items).toEqual([
      {
        kind: 'steps',
        steps: [
          { id: 'call-draft_message', tool: 'draft_message', state: 'failed' },
          { id: 'call-draft_job_content', tool: 'draft_job_content', state: 'failed' },
        ],
      },
    ])
  })

  it('reads a user message as plain text', () => {
    expect(assistantItems({ role: 'user', parts: [{ type: 'text', text: 'Ciao' }, { type: 'file', url: 'x' }] })).toEqual([{ kind: 'text', text: 'Ciao' }])
  })
})

describe('stepLabelKey', () => {
  it('has one wording per known tool and state, a generic one otherwise', () => {
    expect(stepLabelKey({ id: '1', tool: 'get_job', state: 'done' })).toBe('assistant.steps.get_job.done')
    expect(stepLabelKey({ id: '1', tool: 'get_job', state: 'running' })).toBe('assistant.steps.get_job.running')
    expect(stepLabelKey({ id: '1', tool: 'mystery', state: 'done' })).toBe('assistant.steps.generic.done')
    expect(stepLabelKey({ id: '1', tool: 'get_job', state: 'failed' })).toBe('assistant.steps.failed')
  })
})

describe('isAgentNotConfigured', () => {
  it('recognises the api saying no model is configured', () => {
    expect(isAgentNotConfigured(new Error(JSON.stringify({ success: false, data: null, error: { code: 'agent_disabled', message: 'x' } })))).toBe(true)
    expect(isAgentNotConfigured(new Error('agent_disabled'))).toBe(true)
  })
  it('is false for anything else', () => {
    expect(isAgentNotConfigured(new Error('{"error":{"code":"forbidden"}}'))).toBe(false)
    expect(isAgentNotConfigured(new Error('Failed to fetch'))).toBe(false)
    expect(isAgentNotConfigured(undefined)).toBe(false)
    expect(isAgentNotConfigured('agent_disabled')).toBe(false)
    expect(isAgentNotConfigured(new Error('agent_not_configured'))).toBe(false)
  })
})
