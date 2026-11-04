import { describe, expect, it } from 'vitest';
import { CLAUDE_REDIRECT_URIS, createRedirectPolicy, mcpOAuthSettings, mcpResourceOf } from './mcp-oauth-settings.js';

describe('mcpResourceOf', () => {
  it('is the MCP endpoint of the web origin, https or loopback only', () => {
    expect(mcpResourceOf('https://ats.example.org')).toBe('https://ats.example.org/mcp');
    expect(mcpResourceOf('https://ats.example.org/')).toBe('https://ats.example.org/mcp');
    expect(mcpResourceOf('http://localhost:3000')).toBe('http://localhost:3000/mcp');
    expect(mcpResourceOf('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000/mcp');
    expect(mcpResourceOf('http://192.168.1.10:3000')).toBeNull();
  });
});

describe('createRedirectPolicy', () => {
  const strict = createRedirectPolicy({ extra: ['https://agent.example/cb'], allowLoopback: false });

  it("accepts Claude's callbacks and the operator's exact URIs only", () => {
    for (const uri of CLAUDE_REDIRECT_URIS) expect(strict(uri)).toBe(true);
    expect(strict('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(strict('https://agent.example/cb')).toBe(true);
    for (const bad of [
      'https://claude.ai/api/mcp/auth_callback/',
      'https://claude.ai/api/mcp/auth_callback?x=1',
      'https://claude.ai.evil.example/api/mcp/auth_callback',
      'https://evil.example/cb',
      'https://agent.example/cb#frag',
      'http://claude.ai/api/mcp/auth_callback',
      'http://127.0.0.1:33418/callback',
      'javascript:alert(1)',
      '',
    ]) {
      expect(strict(bad)).toBe(false);
    }
  });

  it('accepts http loopback callbacks of native clients only when the operator allows them', () => {
    const loopback = createRedirectPolicy({ extra: [], allowLoopback: true });
    for (const uri of ['http://127.0.0.1:33418/callback', 'http://localhost:6274/oauth/callback', 'http://[::1]:8080/cb']) {
      expect(loopback(uri)).toBe(true);
      expect(strict(uri)).toBe(false);
    }
    for (const bad of ['http://127.0.0.1.evil.example/cb', 'http://user@127.0.0.1/cb', 'https://localhost/cb', 'http://10.0.0.1/cb', 'http://127.0.0.1/cb#x']) {
      expect(loopback(bad)).toBe(false);
    }
  });
});

describe('mcpOAuthSettings', () => {
  const env = { MCP_OAUTH_ENABLED: true, BETTER_AUTH_URL: 'https://ats.example.org', MCP_OAUTH_REDIRECT_URIS: [], MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS: false };

  it('is on with the resource of the web origin', () => {
    expect(mcpOAuthSettings(env)).toMatchObject({ enabled: true, resource: 'https://ats.example.org/mcp' });
  });

  it('is off when turned off, or when the origin is neither https nor loopback (an OAuth resource must be)', () => {
    expect(mcpOAuthSettings({ ...env, MCP_OAUTH_ENABLED: false }).enabled).toBe(false);
    expect(mcpOAuthSettings({ ...env, BETTER_AUTH_URL: 'http://192.168.1.10:3000' })).toMatchObject({ enabled: false, resource: null });
  });
});
