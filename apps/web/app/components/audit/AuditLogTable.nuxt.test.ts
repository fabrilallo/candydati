import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import type { AuditEventView } from '@/lib/audit-view'
import AuditLogTable from './AuditLogTable.vue'

const event = (overrides: Partial<AuditEventView> = {}): AuditEventView => ({
  id: 'e1',
  organizationId: 'o1',
  actor: { type: 'user', id: 'u1', onBehalfOfUserId: null, name: 'Ada Lovelace' },
  action: 'organization.created',
  target: { type: 'organization', id: 'org_1234567890abcdef' },
  metadata: {},
  occurredAt: '2026-10-13T10:05:00.000Z',
  ...overrides,
})

describe('AuditLogTable', () => {
  it('renders one row per event with a translated action label', async () => {
    const wrapper = await mountSuspended(AuditLogTable, {
      props: { events: [event(), event({ id: 'e2', action: 'invitation.created', metadata: { email: 'new@example.com', role: 'recruiter' } })] },
    })
    const rows = wrapper.findAll('[data-testid="audit-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.find('[data-testid="audit-action"]').text()).toBe("Ha creato l'organizzazione")
    expect(rows[1]?.find('[data-testid="audit-action"]').text()).toBe('Ha invitato una persona')
    expect(rows[1]?.text()).toContain('new@example.com')
    expect(rows[1]?.text()).toContain('Recruiter')
  })

  it('shows the person by name and shortens the target id', async () => {
    const wrapper = await mountSuspended(AuditLogTable, { props: { events: [event()] } })
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.find('code').text()).toBe('org_1234…')
    expect(wrapper.find('time').attributes('datetime')).toBe('2026-10-13T10:05:00.000Z')
  })

  it('tells agents and api keys apart from people', async () => {
    const wrapper = await mountSuspended(AuditLogTable, {
      props: {
        events: [
          event({ id: 'a', actor: { type: 'agent', id: 'sourcing-agent', onBehalfOfUserId: 'u1', name: null } }),
          event({ id: 'k', actor: { type: 'api_key', id: 'key_1', onBehalfOfUserId: null, name: null } }),
          event({ id: 'p' }),
        ],
      },
    })
    const kinds = wrapper.findAll('[data-actor-kind]').map((node) => node.attributes('data-actor-kind'))
    expect(kinds).toEqual(['agent', 'api_key', 'user'])
    expect(wrapper.text()).toContain('Agente')
    expect(wrapper.text()).toContain('Chiave API')
    expect(wrapper.text()).toContain('per conto di un utente')
    expect(wrapper.text()).toContain('sourcing-agent')
  })

  it('does not break on an action this build does not know', async () => {
    const wrapper = await mountSuspended(AuditLogTable, { props: { events: [event({ action: 'candidate.hired' })] } })
    expect(wrapper.find('[data-testid="audit-action"]').text()).toBe('Azione non riconosciuta')
  })

  it('shows an empty state', async () => {
    const wrapper = await mountSuspended(AuditLogTable, { props: { events: [] } })
    expect(wrapper.text()).toContain('Ancora nessuna azione registrata')
    expect(wrapper.find('table').exists()).toBe(false)
  })
})
