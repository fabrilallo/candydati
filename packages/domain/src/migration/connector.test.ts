import { describe, expect, it } from 'vitest';
import {
  MIGRATION_CONNECTOR_CREDENTIALS_MAX,
  migrationConnectorDtoSchema,
  migrationConnectorIdSchema,
  migrationConnectorInputSchema,
  migrationConnectorFieldSchema,
} from './connector.js';

const field = { name: 'apiKey', label: { en: 'API key', it: 'Chiave API' }, type: 'password', secret: true };

describe('migration connector contract', () => {
  it('accepts lowercase connector ids only', () => {
    for (const id of ['teamtailor', 'workable', 'test-fake']) expect(migrationConnectorIdSchema.safeParse(id).success, id).toBe(true);
    for (const id of ['', 'Teamtailor', '../x', 'a', 'x'.repeat(41), 'with space']) expect(migrationConnectorIdSchema.safeParse(id).success, id).toBe(false);
  });

  it('describes a field in both languages; a secret is always a password input', () => {
    expect(migrationConnectorFieldSchema.safeParse(field).success).toBe(true);
    expect(migrationConnectorFieldSchema.safeParse({ ...field, label: { en: 'API key' } }).success).toBe(false);
    expect(migrationConnectorFieldSchema.safeParse({ ...field, type: 'text' }).success).toBe(false);
    expect(migrationConnectorFieldSchema.safeParse({ ...field, howToUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(migrationConnectorFieldSchema.safeParse({ ...field, howToUrl: 'https://docs.example.com/keys' }).success).toBe(true);
  });

  it('reads a connector as the api lists it', () => {
    const dto = { id: 'teamtailor', label: 'Teamtailor', maturity: 'beta', input: 'api', docsUrl: 'https://docs.example.com', fields: [field] };
    expect(migrationConnectorDtoSchema.safeParse(dto).success).toBe(true);
    expect(migrationConnectorDtoSchema.safeParse({ ...dto, maturity: 'package' }).success).toBe(false);
  });

  it('takes credentials as a small map of strings, nothing else', () => {
    expect(migrationConnectorInputSchema.safeParse({ connectorId: 'teamtailor', credentials: { apiKey: 'k' } }).success).toBe(true);
    expect(migrationConnectorInputSchema.safeParse({ connectorId: 'teamtailor', credentials: { apiKey: 1 } }).success).toBe(false);
    expect(migrationConnectorInputSchema.safeParse({ connectorId: 'teamtailor', credentials: { apiKey: 'x'.repeat(4097) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: MIGRATION_CONNECTOR_CREDENTIALS_MAX + 1 }, (_, i) => [`k${i}`, 'v']));
    expect(migrationConnectorInputSchema.safeParse({ connectorId: 'teamtailor', credentials: many }).success).toBe(false);
    expect(migrationConnectorInputSchema.safeParse({ connectorId: 'teamtailor', credentials: { apiKey: 'k' }, extra: 1 }).success).toBe(false);
  });
});
