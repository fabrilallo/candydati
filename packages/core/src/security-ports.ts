import type { ApiKeyRepository, MemberRoleLookup } from './api-key-ports.js';
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

/** Whether a person has two-factor authentication on (Better Auth's `user.two_factor_enabled`). */
export interface TwoFactorLookup {
  enabled(userId: string): Promise<boolean>;
}

export interface SecurityDeps extends CoreDeps {
  readonly securitySettings: SecuritySettingsRepository;
  /** Turning the requirement on reports the API keys it suspends (creator an owner or admin without 2FA). */
  readonly apiKeys: Pick<ApiKeyRepository, 'list'>;
  readonly memberRoles: MemberRoleLookup;
  readonly twoFactor: TwoFactorLookup;
  readonly now: () => Date;
}
