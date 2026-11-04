/** Connected apps (MCP over OAuth) as the api returns them. Made-up names only. */
export const connectedApp = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  clientId: `client-${id}`,
  clientName: 'Claude',
  clientUri: 'https://claude.ai',
  userId: 'u1',
  userName: 'Ada',
  scopes: ['mcp', 'offline_access'],
  connectedAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-01T09:00:00.000Z',
  ...overrides,
})

export const consentOrganization = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id === 'o1' ? 'Acme' : 'Globex',
  role: 'recruiter',
  active: false,
  twoFactorRequired: false,
  ...overrides,
})

export const consentPreview = (overrides: Record<string, unknown> = {}) => ({
  client: { clientId: 'c1', name: 'Claude', uri: 'https://claude.ai', icon: null, redirectUri: 'https://claude.ai/api/mcp/auth_callback' },
  scopes: ['mcp', 'offline_access'],
  organizations: [consentOrganization('o1', { active: true }), consentOrganization('o2', { role: 'interviewer' })],
  ...overrides,
})

/** A signed query as the server writes it (values made up). */
export const SIGNED_QUERY = 'response_type=code&client_id=c1&scope=mcp+offline_access&state=s1&exp=1999999999&ba_param=client_id&sig=AbC%2Bd'
