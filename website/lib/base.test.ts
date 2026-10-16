import { describe, expect, it } from 'vitest';
import { docsBase } from './base.js';

describe('docsBase', () => {
  it('defaults to the root of a custom domain', () => {
    expect(docsBase({})).toBe('/');
    expect(docsBase({ DOCS_BASE: '  ' })).toBe('/');
  });

  it('keeps a project pages path', () => {
    expect(docsBase({ DOCS_BASE: '/candydati/' })).toBe('/candydati/');
  });

  it('adds the missing slashes', () => {
    expect(docsBase({ DOCS_BASE: 'candydati' })).toBe('/candydati/');
    expect(docsBase({ DOCS_BASE: '/candydati' })).toBe('/candydati/');
  });

  it('refuses anything that is not a plain path', () => {
    expect(() => docsBase({ DOCS_BASE: 'https://example.com/' })).toThrow(/DOCS_BASE/);
    expect(() => docsBase({ DOCS_BASE: '/a b/' })).toThrow(/DOCS_BASE/);
    expect(() => docsBase({ DOCS_BASE: '/../' })).toThrow(/DOCS_BASE/);
  });
});
