import { describe, expect, it } from 'vitest';
import { buildManifest, parseOrigins } from './manifest.js';

describe('manifest', () => {
  it('asks for the fewest permissions and only answers the Candydati origins', () => {
    const manifest = buildManifest('0.6.0', ['https://*.candydati.it', 'http://localhost:3000']);
    expect(manifest.permissions).toEqual(['tabGroups', 'scripting', 'storage']);
    expect(manifest.host_permissions).toEqual(['https://www.linkedin.com/*', 'https://www.google.com/*']);
    expect(manifest.content_scripts).toEqual([{ matches: ['https://www.linkedin.com/*'], js: ['content-save.js'], run_at: 'document_idle' }]);
    expect(manifest.externally_connectable.matches).toEqual(['https://*.candydati.it/*', 'http://localhost:3000/*']);
    expect(manifest.version).toBe('0.6.0');
  });

  it('refuses origins that are not https (except localhost), and an empty list', () => {
    expect(parseOrigins(' https://*.candydati.it , https://candydati.example ')).toEqual(['https://*.candydati.it', 'https://candydati.example']);
    expect(() => parseOrigins('http://candydati.it')).toThrow(/Invalid origin/);
    expect(() => parseOrigins('https://*')).toThrow(/Invalid origin/);
    expect(() => parseOrigins('')).toThrow(/empty/);
  });
});
