import type { ApiKey, Role } from '@tt/domain';
import type { CoreDeps } from './ports.js';

export interface ApiKeyRepository {
  create(key: ApiKey): Promise<ApiKey>;
  /** Full replace by (organizationId, id): used to revoke. */
  save(key: ApiKey): Promise<ApiKey>;
  findById(organizationId: string, id: string): Promise<ApiKey | null>;
  /**
   * Across organizations, by the stored prefix of a presented secret: the only lookup that cannot be scoped to an
   * organization, because the secret is what tells us which one it belongs to. The caller then compares hashes.
   */
  findByPrefix(prefix: string): Promise<ApiKey | null>;
  /** Newest first. */
  list(organizationId: string): Promise<readonly ApiKey[]>;
  /** Sets `lastUsedAt`. */
  touch(organizationId: string, id: string, at: Date): Promise<void>;
}

/** Role of a user in an organization right now, or null when they are not a member (any more). */
export interface MemberRoleLookup {
  roleOf(organizationId: string, userId: string): Promise<Role | null>;
}

export interface ApiKeyDeps extends CoreDeps {
  readonly apiKeys: ApiKeyRepository;
  readonly memberRoles: MemberRoleLookup;
  /** A new secret from a CSPRNG in the format `tt_<prefix>_<random>`. Randomness lives in deps, never in core. */
  readonly newSecret: () => string;
  /** sha256 of the secret as hex. */
  readonly hash: (secret: string) => string;
  readonly newId: () => string;
  readonly now: () => Date;
}

export type ApiKeyAuthDeps = Pick<ApiKeyDeps, 'apiKeys' | 'memberRoles' | 'hash' | 'now'>;
