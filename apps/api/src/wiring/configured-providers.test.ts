import { describe, expect, it } from 'vitest';
import { NO_MODEL, configuredProviders } from './configured-providers.js';
import { testEnv } from '../testing/test-app.js';

describe('configuredProviders', () => {
  it('names the S3 host only, the email transport and the model provider', () => {
    const env = testEnv({ S3_ENDPOINT: 'https://user:pw@s3.eu-west-1.example.com:9443/path?x=1', S3_SECRET_KEY: 'super-secret', AGENT_MODEL: 'anthropic/claude-x', FAST_MODEL: 'openai/gpt-x' });
    const providers = configuredProviders(env);
    expect(providers).toEqual({ storage: 's3 (s3.eu-west-1.example.com:9443)', email: 'log', model: 'anthropic' });
    expect(JSON.stringify(providers)).not.toMatch(/super-secret|user|pw|claude-x|gpt-x/);
  });

  it('falls back to FAST_MODEL and then to nessuno', () => {
    expect(configuredProviders(testEnv({ FAST_MODEL: 'openai/gpt-x' })).model).toBe('openai');
    expect(configuredProviders(testEnv()).model).toBe(NO_MODEL);
  });
});
