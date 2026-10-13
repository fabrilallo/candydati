import { describe, expect, it } from 'vitest';
import { loadS3Config } from './config.js';

const env = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'team-tracker',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'super-secret-value',
  S3_FORCE_PATH_STYLE: 'true',
};

describe('loadS3Config', () => {
  it('parses and applies defaults', () => {
    expect(loadS3Config(env)).toEqual({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'team-tracker',
      accessKeyId: 'key',
      secretAccessKey: 'super-secret-value',
      forcePathStyle: true,
    });
    expect(loadS3Config({ ...env, S3_FORCE_PATH_STYLE: undefined }).forcePathStyle).toBe(false);
  });

  it('names the variable and never the secret', () => {
    let message = '';
    try {
      loadS3Config({ ...env, S3_ENDPOINT: 'nope', S3_ACCESS_KEY: '' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('S3_ENDPOINT');
    expect(message).toContain('S3_ACCESS_KEY');
    expect(message).not.toContain('super-secret-value');
    expect(message).not.toContain('nope');
  });

  it('reports a missing secret by name', () => {
    expect(() => loadS3Config({ ...env, S3_SECRET_KEY: undefined })).toThrow('S3_SECRET_KEY');
  });
});
