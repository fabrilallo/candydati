import type { ConfiguredProviders } from '@tt/core';
import type { Env } from '../config/env.js';

export const NO_MODEL = 'nessuno';

/** `openai/gpt-x` becomes `openai`: the model name and any key never leave the configuration. */
const providerOf = (model: string | undefined): string | null => {
  const name = model?.split('/')[0]?.trim();
  return name ? name : null;
};

const hostOf = (endpoint: string): string => {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown';
  }
};

/** Names of the configured providers for the registro dei trattamenti. Never credentials, paths or full URLs. */
export function configuredProviders(env: Pick<Env, 's3' | 'email' | 'AGENT_MODEL' | 'FAST_MODEL'>): ConfiguredProviders {
  return {
    storage: `s3 (${hostOf(env.s3.endpoint)})`,
    email: env.email.transport.kind,
    model: providerOf(env.AGENT_MODEL) ?? providerOf(env.FAST_MODEL) ?? NO_MODEL,
  };
}
