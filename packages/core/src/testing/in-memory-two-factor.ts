import type { TwoFactorLookup } from '../security-ports.js';

export interface InMemoryTwoFactor extends TwoFactorLookup {
  /** Turns 2FA on for a person. */
  enable(userId: string): void;
}

/** Nobody has 2FA until `enable` is called. */
export function createInMemoryTwoFactor(initial: readonly string[] = []): InMemoryTwoFactor {
  let enabled: ReadonlySet<string> = new Set(initial);
  return {
    async enabled(userId) {
      return enabled.has(userId);
    },
    enable(userId) {
      enabled = new Set([...enabled, userId]);
    },
  };
}
