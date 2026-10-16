import { describe, expect, it } from 'vitest';
import { createFakeConnector } from '../testing/fake-connector.js';
import { BUILT_IN_MIGRATION_CONNECTORS, createConnectorRegistry } from './registry.js';

describe('createConnectorRegistry', () => {
  it('ships no vendor connector yet: an empty catalog', () => {
    expect(BUILT_IN_MIGRATION_CONNECTORS).toEqual([]);
    expect(createConnectorRegistry().list()).toEqual([]);
  });

  it('finds connectors by id and lists them', () => {
    const fake = createFakeConnector();
    const registry = createConnectorRegistry([fake]);
    expect(registry.list()).toEqual([fake]);
    expect(registry.find('fake-ats')).toBe(fake);
    expect(registry.get('fake-ats')).toBe(fake);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('refuses a duplicate id and a connector badly described (a secret shown as text, a bad id)', () => {
    const fake = createFakeConnector();
    expect(() => createConnectorRegistry([fake, fake])).toThrow('registered twice');
    expect(() => createConnectorRegistry([{ ...fake, id: 'Bad Id' }])).toThrow('badly described');
    expect(() => createConnectorRegistry([{ ...fake, fields: [{ name: 'apiKey', label: { en: 'Key', it: 'Chiave' }, type: 'text', secret: true }] }])).toThrow('badly described');
    expect(() => createConnectorRegistry([{ ...fake, docsUrl: 'http://insecure.example.com' }])).toThrow('badly described');
  });
});
