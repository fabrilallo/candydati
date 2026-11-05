import { describe, expect, it } from 'vitest';
import { mcpChallenge, protectedResourceMetadataUrl } from './challenge.js';

describe('protectedResourceMetadataUrl', () => {
  it('inserts the well-known segment before the resource path (RFC 9728 §3.1)', () => {
    expect(protectedResourceMetadataUrl('https://ats.example.org/mcp')).toBe('https://ats.example.org/.well-known/oauth-protected-resource/mcp');
    expect(protectedResourceMetadataUrl('http://localhost:3000/mcp')).toBe('http://localhost:3000/.well-known/oauth-protected-resource/mcp');
  });
});

describe('mcpChallenge', () => {
  const resource = 'https://ats.example.org/mcp';

  it('points a client without credentials to the metadata (RFC 6750 §3: no error code)', () => {
    expect(mcpChallenge(resource, 'missing')).toBe('Bearer resource_metadata="https://ats.example.org/.well-known/oauth-protected-resource/mcp", scope="mcp candidate:propose_move"');
  });

  it('says invalid_token when credentials were sent but refused', () => {
    expect(mcpChallenge(resource, 'invalid')).toBe('Bearer error="invalid_token", resource_metadata="https://ats.example.org/.well-known/oauth-protected-resource/mcp", scope="mcp candidate:propose_move"');
  });

  it('is a plain bearer challenge while OAuth is off', () => {
    expect(mcpChallenge(null, 'invalid')).toBe('Bearer error="invalid_token"');
    expect(mcpChallenge(null, 'missing')).toBe('Bearer');
  });
});
