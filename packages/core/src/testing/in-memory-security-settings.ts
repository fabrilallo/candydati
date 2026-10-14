import { DEFAULT_SECURITY_SETTINGS, type SecuritySettings, type SecuritySettingsRepository } from '../security-ports.js';
import { cell } from './in-memory-transaction.js';

export function createInMemorySecuritySettings(): SecuritySettingsRepository {
  const rows = cell<ReadonlyMap<string, SecuritySettings>>(new Map());
  return {
    async get(organizationId) {
      return rows.get().get(organizationId) ?? DEFAULT_SECURITY_SETTINGS;
    },
    async setRequireTwoFactor(organizationId, value) {
      const next: SecuritySettings = { requireTwoFactor: value };
      rows.set(new Map([...rows.get(), [organizationId, next]]));
      return next;
    },
  };
}
