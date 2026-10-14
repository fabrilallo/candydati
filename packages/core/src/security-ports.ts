import type { CoreDeps } from './ports.js';

/** Security settings of an organization. Absent row means the defaults. */
export interface SecuritySettings {
  /** Owners and admins must have two-factor authentication on to use the app. */
  readonly requireTwoFactor: boolean;
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = { requireTwoFactor: false };

export interface SecuritySettingsRepository {
  get(organizationId: string): Promise<SecuritySettings>;
  setRequireTwoFactor(organizationId: string, value: boolean, at: Date): Promise<SecuritySettings>;
}

export interface SecurityDeps extends CoreDeps {
  readonly securitySettings: SecuritySettingsRepository;
  readonly now: () => Date;
}
