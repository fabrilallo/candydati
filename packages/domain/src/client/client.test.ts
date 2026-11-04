import { describe, expect, it } from 'vitest';
import {
  agencySettingInputSchema,
  CLIENT_CONTACTS_MAX,
  clientInputSchema,
  jobClientInputSchema,
  publicJobClientOf,
  type Client,
} from './client.js';

const CLIENT: Client = {
  id: 'client_1',
  organizationId: 'org_a',
  name: 'Acme Test Srl',
  website: 'https://acme.example',
  logoUrl: 'https://acme.example/logo.png',
  contacts: [{ id: 'contact_1', name: 'Carla Contact', email: 'carla@acme.example' }],
  archivedAt: null,
  createdBy: 'user_1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('clientInputSchema', () => {
  it('accepts a client with only a name, trimming it', () => {
    expect(clientInputSchema.parse({ name: '  Acme  ' })).toEqual({ name: 'Acme', website: null, logoUrl: null, contacts: [] });
  });

  it('lowercases contact emails and keeps their names', () => {
    const parsed = clientInputSchema.parse({ name: 'Acme', contacts: [{ name: 'Carla', email: 'Carla@Acme.Example' }] });
    expect(parsed.contacts).toEqual([{ name: 'Carla', email: 'carla@acme.example' }]);
  });

  it('refuses a blank name, web addresses that are not http(s), an http logo and too many contacts', () => {
    expect(clientInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ name: 'Acme', website: 'javascript:alert(1)' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ name: 'Acme', logoUrl: 'http://acme.example/logo.png' }).success).toBe(false);
    const contacts = Array.from({ length: CLIENT_CONTACTS_MAX + 1 }, (_, i) => ({ name: `P${i}`, email: `p${i}@acme.example` }));
    expect(clientInputSchema.safeParse({ name: 'Acme', contacts }).success).toBe(false);
  });

  it('refuses the same contact email twice and unknown fields', () => {
    const twice = [{ name: 'A', email: 'a@acme.example' }, { name: 'B', email: 'A@acme.example' }];
    expect(clientInputSchema.safeParse({ name: 'Acme', contacts: twice }).success).toBe(false);
    expect(clientInputSchema.safeParse({ name: 'Acme', score: 3 }).success).toBe(false);
  });
});

describe('jobClientInputSchema and agencySettingInputSchema', () => {
  it('needs a display choice with a client, and allows removing the client', () => {
    expect(jobClientInputSchema.parse({ clientId: 'client_1', display: 'confidential' })).toEqual({ clientId: 'client_1', display: 'confidential' });
    expect(jobClientInputSchema.parse({ clientId: null })).toEqual({ clientId: null, display: 'named' });
    expect(jobClientInputSchema.safeParse({ clientId: 'client_1', display: 'hidden' }).success).toBe(false);
  });

  it('trims the authorization reference and turns a blank one into null', () => {
    expect(agencySettingInputSchema.parse({ recruitsForClients: true, agencyAuthorization: '  Aut. Min. 123  ' })).toEqual({ recruitsForClients: true, agencyAuthorization: 'Aut. Min. 123' });
    expect(agencySettingInputSchema.parse({ recruitsForClients: false, agencyAuthorization: '  ' })).toEqual({ recruitsForClients: false, agencyAuthorization: null });
  });
});

describe('publicJobClientOf', () => {
  it('names the client when the job says so, with its website and logo', () => {
    expect(publicJobClientOf(CLIENT, 'named', 'Aut. 1')).toEqual({
      display: 'named',
      name: 'Acme Test Srl',
      website: 'https://acme.example',
      logo: 'https://acme.example/logo.png',
      agencyAuthorization: 'Aut. 1',
    });
  });

  it('says nothing about a confidential client: no name, no website, no logo', () => {
    expect(publicJobClientOf(CLIENT, 'confidential', null)).toEqual({ display: 'confidential', name: null, website: null, logo: null, agencyAuthorization: null });
  });

  it('never exposes the contacts', () => {
    expect(JSON.stringify(publicJobClientOf(CLIENT, 'named', null))).not.toContain('carla');
  });
});
