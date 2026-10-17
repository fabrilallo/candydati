import type { InstanceAiSettingsDto } from '@candydati/domain'

/** Instance AI settings as the api returns them; by default a fresh instance with no model. */
export const instanceAi = (overrides: Partial<InstanceAiSettingsDto> = {}): InstanceAiSettingsDto => ({
  source: 'none',
  canManage: true,
  provider: null,
  hasApiKey: false,
  assistantModel: null,
  fastModel: null,
  assistantEnabled: false,
  fastEnabled: false,
  verifiedAt: null,
  ...overrides,
})

/** Configured from the app with Anthropic: both models on, a key stored. */
export const aiReady = (overrides: Partial<InstanceAiSettingsDto> = {}): InstanceAiSettingsDto =>
  instanceAi({
    source: 'app',
    provider: 'anthropic',
    hasApiKey: true,
    assistantModel: 'claude-sonnet-5-5',
    fastModel: 'claude-haiku-5-5',
    assistantEnabled: true,
    fastEnabled: true,
    verifiedAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  })
