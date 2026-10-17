import type { InstanceAiSettingsDto } from '@candydati/domain'

/** Instance AI settings as the api returns them; by default a fresh instance with no model. */
export const instanceAi = (overrides: Partial<InstanceAiSettingsDto> = {}): InstanceAiSettingsDto => ({
  source: 'none',
  canManage: true,
  assistant: null,
  fast: null,
  assistantEnabled: false,
  fastEnabled: false,
  storedKeys: [],
  verifiedAt: null,
  ...overrides,
})

/** Configured from the app: the assistant on Anthropic, the fast model on Google, a key stored for each. */
export const aiReady = (overrides: Partial<InstanceAiSettingsDto> = {}): InstanceAiSettingsDto =>
  instanceAi({
    source: 'app',
    assistant: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    fast: { provider: 'google', model: 'gemini-3.1-flash-lite' },
    assistantEnabled: true,
    fastEnabled: true,
    storedKeys: ['anthropic', 'google'],
    verifiedAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  })
