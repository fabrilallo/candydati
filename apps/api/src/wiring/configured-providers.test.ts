import { describe, expect, it } from 'vitest';
import { configuredProviders } from './configured-providers.js';
import { testEnv } from '../testing/test-app.js';

const ai = (assistant: string | null, fast: string | null) => ({
  snapshot: () => ({ source: 'app' as const, provider: null, verifiedAt: null, assistant: assistant ? { id: assistant as `${string}/${string}`, apiKey: 'sk-secret' } : null, fast: fast ? { id: fast as `${string}/${string}` } : null }),
});

describe('configuredProviders', () => {
  it('names the S3 host only, the email transport and the model provider, never a key or a model name', () => {
    const env = testEnv({ S3_ENDPOINT: 'https://user:pw@s3.eu-west-1.example.com:9443/path?x=1', S3_SECRET_KEY: 'super-secret' });
    const providers = configuredProviders(env, ai('anthropic/claude-x', 'openai/gpt-x'));
    expect({ ...providers, model: providers.model }).toEqual({ storage: 's3 (s3.eu-west-1.example.com:9443)', email: 'log', model: 'anthropic' });
    expect(JSON.stringify({ ...providers, model: providers.model })).not.toMatch(/super-secret|sk-secret|user|pw|claude-x|gpt-x/);
  });

  it('falls back to the fast model, and has no model provider when no model is on (the line is left out)', () => {
    const env = testEnv();
    expect(configuredProviders(env, ai(null, 'openai/gpt-x')).model).toBe('openai');
    expect(configuredProviders(env, ai(null, null)).model).toBeNull();
  });

  it('follows a change of the AI settings without being built again', () => {
    let assistant: string | null = null;
    const providers = configuredProviders(testEnv(), { snapshot: () => ai(assistant, null).snapshot() });
    expect(providers.model).toBeNull();
    assistant = 'mistral/small';
    expect(providers.model).toBe('mistral');
  });
});
