import { describe, expect, it } from 'vitest';
import { roleGuardHooks } from './role-guards.js';

describe('organization logo guard', () => {
  it('refuses a logo that is not an https URL on create and update', async () => {
    await expect(roleGuardHooks.beforeCreateOrganization({ organization: { logo: 'javascript:alert(1)' } })).rejects.toThrow();
    await expect(roleGuardHooks.beforeUpdateOrganization({ organization: { logo: 'http://a.example/l.png' } })).rejects.toThrow();
  });
  it('accepts https, empty and absent logos', async () => {
    await expect(roleGuardHooks.beforeCreateOrganization({ organization: { logo: 'https://a.example/l.png' } })).resolves.toBeUndefined();
    await expect(roleGuardHooks.beforeUpdateOrganization({ organization: { logo: null } })).resolves.toBeUndefined();
    await expect(roleGuardHooks.beforeUpdateOrganization({ organization: {} })).resolves.toBeUndefined();
  });
});
