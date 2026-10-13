import { AuditWriteError, ValidationError } from '@tt/core';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerErrorHandler } from './error-handler.js';

const appThrowing = (error: unknown) => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/boom', async () => {
    throw error;
  });
  return app;
};

describe('error handler', () => {
  it('answers a core error in the envelope with its mapped status', async () => {
    const response = await appThrowing(new ValidationError([{ path: 'limit', message: 'Too big' }])).inject({ url: '/boom' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ success: false, data: null, error: { code: 'validation_failed', message: 'limit: Too big' } });
  });

  it('answers audit_failed as a 500 without the cause', async () => {
    const response = await appThrowing(new AuditWriteError(new Error('password=hunter2'))).inject({ url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(response.json().error.code).toBe('audit_failed');
  });

  it('answers anything unexpected with a generic 500 that leaks nothing', async () => {
    const response = await appThrowing(new Error('connect ECONNREFUSED postgres://tt:tt@db/secret')).inject({ url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ success: false, data: null, error: { code: 'internal_error', message: 'Internal server error.' } });
  });

  it('answers unknown routes with a 404 envelope', async () => {
    const response = await appThrowing(new Error('x')).inject({ url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
