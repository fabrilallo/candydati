import { AuditWriteError, ConflictError, ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from '@tt/core';
import { describe, expect, it } from 'vitest';
import { UnauthenticatedError, toHttpFailure } from './errors.js';

describe('toHttpFailure', () => {
  it.each([
    [new ForbiddenError(), 403, 'forbidden'],
    [new NotFoundError(), 404, 'not_found'],
    [new ConflictError(), 409, 'conflict'],
    [new RateLimitedError(), 429, 'rate_limited'],
    [new UnauthenticatedError(), 401, 'unauthenticated'],
  ])('maps %o', (error, status, code) => {
    expect(toHttpFailure(error)).toMatchObject({ status, code, log: false });
  });

  it('maps core validation errors to 422 listing the issues', () => {
    const failure = toHttpFailure(new ValidationError([{ path: 'page', message: 'Too small' }]));
    expect(failure).toEqual({ status: 422, code: 'validation_failed', message: 'page: Too small', log: false });
  });

  it('maps file problems on cv to 413 and 415, other cv issues stay 422, conflicts keep their message', () => {
    expect(toHttpFailure(new ValidationError([{ path: 'cv', message: 'cv_too_large' }]))).toMatchObject({ status: 413, code: 'payload_too_large' });
    expect(toHttpFailure(new ValidationError([{ path: 'cv', message: 'unsupported_file' }]))).toMatchObject({ status: 415, code: 'unsupported_file' });
    expect(toHttpFailure(new ValidationError([{ path: 'cv', message: 'cv_empty' }])).status).toBe(422);
    expect(toHttpFailure(new ValidationError([{ path: 'form', message: 'cv_too_large' }])).status).toBe(422);
    expect(toHttpFailure(new ConflictError('already_applied'))).toMatchObject({ status: 409, code: 'conflict', message: 'already_applied' });
  });

  it('falls back to the generic message for a validation error without issues', () => {
    expect(toHttpFailure(new ValidationError([])).message).toBe('The input is not valid.');
  });

  it('maps audit_failed to a logged 500 with its safe message, hiding the cause', () => {
    const failure = toHttpFailure(new AuditWriteError(new Error('connection string postgres://secret')));
    expect(failure).toMatchObject({ status: 500, code: 'audit_failed', log: true });
    expect(failure.message).not.toContain('secret');
  });

  it('maps schema validation errors to 422', () => {
    const failure = toHttpFailure({ validation: [{ instancePath: '/query/page', message: 'must be integer' }] });
    expect(failure).toEqual({ status: 422, code: 'validation_failed', message: 'query.page: must be integer', log: false });
  });

  it.each([
    [429, 'rate_limited', 'Too many requests.'],
    [400, 'bad_request', 'Body is not valid JSON'],
    [415, 'unsupported_media_type', 'Body is not valid JSON'],
    [418, 'bad_request', 'Body is not valid JSON'],
  ])('maps a %i from the framework', (statusCode, code, message) => {
    expect(toHttpFailure({ statusCode, message: 'Body is not valid JSON' })).toMatchObject({ status: statusCode, code, message, log: false });
  });

  it('defaults a client error without a message', () => {
    expect(toHttpFailure({ statusCode: 400 }).message).toBe('Bad request.');
  });

  it.each([new Error('boom: password=hunter2'), { statusCode: 503 }, 'text', null, undefined])(
    'turns %o into a generic logged 500 that leaks nothing',
    (error) => {
      expect(toHttpFailure(error)).toEqual({ status: 500, code: 'internal_error', message: 'Internal server error.', log: true });
    },
  );
});

describe('storage_unavailable', () => {
  it('maps to a logged 503 with the safe message, hiding the cause', async () => {
    const { StorageUnavailableError } = await import('@tt/core');
    const failure = toHttpFailure(new StorageUnavailableError(new Error('ECONNREFUSED 10.0.0.9')));
    expect(failure).toMatchObject({ status: 503, code: 'storage_unavailable', log: true });
    expect(failure.message).not.toContain('10.0.0.9');
  });
});
