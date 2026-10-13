import { describe, expect, it } from 'vitest'
import { inbound, message, template, TEMPLATES } from '~~/test/fixtures/message-fixtures'
import { deliveryErrorKey, messageTotal, messageView, outcomeTemplateKind, sampleValues, templateForKind, templateGroups, threadOf } from './message-view'
import { renderTemplate } from '@tt/domain'

describe('messageView', () => {
  it('shows an outbound message on our side with who sent it and its status', () => {
    expect(messageView(message('m1'), 'Giulia Rossi')).toEqual({
      side: 'outbound',
      author: 'Ada Lovelace',
      authorKey: null,
      statusKey: 'messages.status.sent',
      tone: 'success',
      at: '2026-10-13T10:00:05.000Z',
      unverified: false,
      errorKey: null,
    })
  })

  it('names the system for automatic messages and explains a failure by its code', () => {
    const view = messageView(message('m1', { sentBy: { id: 'system', name: 'system' }, status: 'failed', sentAt: null, error: 'recipient_missing' }), 'Giulia Rossi')
    expect(view).toMatchObject({ author: null, authorKey: 'messages.system', statusKey: 'messages.status.failed', tone: 'destructive', at: '2026-10-13T10:00:00.000Z', errorKey: 'messages.deliveryErrors.recipient_missing' })
    expect(messageView(message('m2', { sentBy: null }), 'G').authorKey).toBe('messages.system')
  })

  it('falls back to a generic reason for an unknown or missing code', () => {
    expect(deliveryErrorKey('smtp_451')).toBe('messages.deliveryErrors.unknown')
    expect(deliveryErrorKey(null)).toBe('messages.deliveryErrors.unknown')
  })

  it('says queued while waiting', () => {
    expect(messageView(message('m1', { status: 'queued', sentAt: null }), 'G')).toMatchObject({ statusKey: 'messages.status.queued', tone: 'secondary' })
  })

  it('shows an inbound message as the candidate, flagged when the sender is not verified', () => {
    expect(messageView(inbound('m2', { unverifiedSender: true }), 'Giulia Rossi')).toMatchObject({ side: 'inbound', author: 'Giulia Rossi', statusKey: null, unverified: true, at: '2026-10-13T12:00:00.000Z' })
  })
})

describe('threadOf', () => {
  it('orders a conversation oldest first without touching the input', () => {
    const items = [inbound('m2'), message('m1')]
    expect(threadOf(items).map((item) => item.id)).toEqual(['m1', 'm2'])
    expect(items.map((item) => item.id)).toEqual(['m2', 'm1'])
  })
})

describe('outcome templates', () => {
  it('maps outcomes to the template kind to propose, none after a withdrawal', () => {
    expect(outcomeTemplateKind('not_selected')).toBe('outcome_not_selected')
    expect(outcomeTemplateKind('hired')).toBe('outcome_hired')
    expect(outcomeTemplateKind('withdrawn')).toBeNull()
  })

  it('prefers the organization template over the default of the same kind', () => {
    const own = template('own', { kind: 'outcome_hired', isDefault: false })
    expect(templateForKind([...TEMPLATES, own], 'outcome_hired')?.id).toBe('own')
    expect(templateForKind(TEMPLATES, 'outcome_hired')?.id).toBe('t-hired')
    expect(templateForKind(TEMPLATES, 'stage_update')).toBeNull()
    expect(templateForKind(TEMPLATES, null)).toBeNull()
  })

  it('groups templates by kind in a fixed order, leaving out empty kinds', () => {
    expect(templateGroups(TEMPLATES).map((group) => [group.kind, group.templates.map((item) => item.id)])).toEqual([
      ['receipt', ['t-receipt']],
      ['outcome_not_selected', ['t-no']],
      ['outcome_hired', ['t-hired']],
      ['custom', ['t-custom']],
    ])
  })
})

describe('messageTotal', () => {
  it('adds the counts of every application, or says it does not know', () => {
    expect(messageTotal([{ messageCount: 2 }, { messageCount: 1 }])).toBe(3)
    expect(messageTotal([{ messageCount: 2 }, { messageCount: null }])).toBeNull()
    expect(messageTotal([])).toBe(0)
  })
})

describe('sampleValues', () => {
  it('gives every variable a value, so a sample preview has no gaps', () => {
    const values = sampleValues({ firstName: 'Giulia', lastName: 'Rossi', jobTitle: 'Backend developer', stageName: 'Colloquio', organizationName: 'Acme', careersUrl: 'https://x.test/careers/acme' })
    const rendered = renderTemplate('{{ candidate.firstName }} {{ candidate.lastName }}, {{ job.title }} da {{ organization.name }}: {{ stage.name }}, {{ job.responseDays }} giorni, {{ job.url }}', values)
    expect(rendered.text).toBe('Giulia Rossi, Backend developer da Acme: Colloquio, 10 giorni, https://x.test/careers/acme')
  })
})
