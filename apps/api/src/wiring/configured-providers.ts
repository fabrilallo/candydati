import type { ConfiguredProviders } from '@candydati/core';
import type { AiRuntime } from '@candydati/providers';
import type { Env } from '../config/env.js';

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

/**
 * Names of the configured providers for the record of processing activities (GDPR art. 30). Never credentials, paths or
 * full URLs. The model provider follows the AI settings in force (null when no model is on: the line is left out).
 */
export function configuredProviders(env: Pick<Env, 's3' | 'email'>, ai: Pick<AiRuntime, 'snapshot'>): ConfiguredProviders {
  return {
    storage: `s3 (${hostOf(env.s3.endpoint)})`,
    email: env.email.transport.kind,
    get model() {
      const { assistant, fast } = ai.snapshot();
      return providerOf(assistant?.id) ?? providerOf(fast?.id);
    },
  };
}
