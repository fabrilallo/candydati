import { INSTANCE_AI_SECRET_CONTEXT, type CredentialsBox, type InstanceAiRecord } from '@candydati/core';

/** Environment variable holding the API key of each provider the Mastra model router knows by default. */
export const AI_PROVIDER_KEYS: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

type Source = Readonly<Record<string, string | undefined>>;

/** Provider of a `provider/model` string. */
export const providerOf = (model: string): string => model.slice(0, model.indexOf('/'));

/** True when the provider's key is set, or when the provider is not one we know (the router then decides). */
export function hasProviderKey(model: string, source: Source): boolean {
  const variable = AI_PROVIDER_KEYS[providerOf(model)];
  return variable === undefined || Boolean(source[variable]?.trim());
}

/** A model to call: `provider/model`, and the key when it comes from the app (else the router reads the environment). */
export interface AiModelRef {
  readonly id: `${string}/${string}`;
  readonly apiKey?: string | undefined;
}

/** What Mastra takes: the key explicitly when there is one, never written to the process environment. */
export const toMastraModel = (ref: AiModelRef): `${string}/${string}` | { readonly id: `${string}/${string}`; readonly apiKey: string } =>
  ref.apiKey === undefined ? ref.id : { id: ref.id, apiKey: ref.apiKey };

/** The instance's AI settings saved from the app (`instance_ai_settings`), with the key already opened. */
export interface StoredAiSettings {
  readonly provider: string;
  readonly apiKey: string | null;
  readonly assistantModel: string | null;
  readonly fastModel: string | null;
  readonly verifiedAt: Date;
}

export type AiSource = 'environment' | 'app' | 'none';

/** The HKDF info of the instance AI key box: a key of its own, distinct from the email and migration secrets. */
export const INSTANCE_AI_SECRET_INFO = 'candydati:instance-ai';

/** The saved settings with their key opened, for the AI runtime of the api and of the worker. */
export const openStoredAiSettings = (record: InstanceAiRecord | null, secrets: CredentialsBox): StoredAiSettings | null =>
  record === null ? null : { ...record, apiKey: record.secretCiphertext === null ? null : secrets.open(record.secretCiphertext, INSTANCE_AI_SECRET_CONTEXT) };

/** The models in force: `assistant` for the side panel and job drafting, `fast` for the ad score and CV reading. */
export interface AiSnapshot {
  readonly source: AiSource;
  readonly provider: string | null;
  readonly assistant: AiModelRef | null;
  readonly fast: AiModelRef | null;
  readonly verifiedAt: Date | null;
}

export interface AiEnv {
  readonly agentModel?: string | undefined;
  readonly fastModel?: string | undefined;
  /** Where the router finds the provider keys of the environment (process.env). */
  readonly keys: Source;
}

export interface AiRuntime {
  snapshot(): AiSnapshot;
  /** Reads the saved settings again; on failure keeps the last good ones. */
  refresh(): Promise<void>;
}

const NONE: AiSnapshot = { source: 'none', provider: null, assistant: null, fast: null, verifiedAt: null };

const fromEnv = (model: string | undefined, keys: Source): AiModelRef | null =>
  model !== undefined && hasProviderKey(model, keys) ? { id: model as `${string}/${string}` } : null;

const fromApp = (stored: StoredAiSettings, model: string | null): AiModelRef | null =>
  model === null || stored.apiKey === null ? null : { id: `${stored.provider}/${model}`, apiKey: stored.apiKey };

const resolve = (env: AiEnv, stored: StoredAiSettings | null): AiSnapshot => {
  if (env.agentModel !== undefined || env.fastModel !== undefined) {
    const provider = env.agentModel ?? env.fastModel;
    return { source: 'environment', provider: provider === undefined ? null : providerOf(provider), assistant: fromEnv(env.agentModel, env.keys), fast: fromEnv(env.fastModel, env.keys), verifiedAt: null };
  }
  if (stored === null) return NONE;
  return { source: 'app', provider: stored.provider, assistant: fromApp(stored, stored.assistantModel), fast: fromApp(stored, stored.fastModel), verifiedAt: stored.verifiedAt };
};

/**
 * The AI settings of a process (api or worker): AGENT_MODEL or FAST_MODEL in the environment wins (a model only with
 * its provider key); else the settings saved from the app, read at start and again on refresh; else no model.
 */
export function createAiRuntime({ env, load, log }: { readonly env: AiEnv; readonly load: () => Promise<StoredAiSettings | null>; readonly log: (line: string) => void }): AiRuntime {
  let current = resolve(env, null);
  return {
    snapshot: () => current,
    async refresh() {
      if (current.source === 'environment') return;
      try {
        current = resolve(env, await load());
      } catch (error) {
        log(`AI settings: could not be read, keeping the previous ones (${error instanceof Error ? error.name : 'error'})`);
      }
    },
  };
}
