import { describe, expect, it } from 'vitest';
import { LOGO_URL_MAX, logoWidthOf, organizationLogoSourceSchema, setOrganizationLogoSchema } from './logo.js';

const MEDIA_ID = '00000000-0000-4000-8000-000000000001';

describe('organizationLogoSourceSchema', () => {
  it('accepts a library image or an https address', () => {
    expect(organizationLogoSourceSchema.parse({ kind: 'media', mediaId: MEDIA_ID })).toEqual({ kind: 'media', mediaId: MEDIA_ID });
    expect(organizationLogoSourceSchema.parse({ kind: 'url', url: 'https://cdn.example/logo.png' })).toEqual({ kind: 'url', url: 'https://cdn.example/logo.png' });
  });

  it('refuses other schemes, too long addresses and ids that are not ours', () => {
    for (const url of ['http://cdn.example/logo.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', `https://cdn.example/${'a'.repeat(LOGO_URL_MAX)}`]) {
      expect(organizationLogoSourceSchema.safeParse({ kind: 'url', url }).success).toBe(false);
    }
    expect(organizationLogoSourceSchema.safeParse({ kind: 'media', mediaId: '../other' }).success).toBe(false);
  });
});

describe('setOrganizationLogoSchema', () => {
  it('takes null to remove the logo', () => {
    expect(setOrganizationLogoSchema.parse({ source: null })).toEqual({ source: null });
    expect(setOrganizationLogoSchema.safeParse({}).success).toBe(false);
  });
});

describe('logoWidthOf', () => {
  it('is the smallest stored width', () => {
    expect(logoWidthOf([400])).toBe(400);
    expect(logoWidthOf([640, 1280])).toBe(640);
    expect(logoWidthOf([])).toBeNull();
  });
});
