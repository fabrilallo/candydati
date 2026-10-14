import { describe, expect, it } from 'vitest';
import { safeErrorSerializer } from './safe-error-serializer.js';

/** The shape Drizzle gives a failed query: the message carries the SQL and the bound values, the cause is the pg error. */
const drizzleError = () => {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "candidate_org_email_uidx"'), {
    code: '23505',
    severity: 'ERROR',
    constraint: 'candidate_org_email_uidx',
    table: 'candidate',
    schema: 'public',
    detail: 'Key (organization_id, lower(email::text))=(org_1, ada@example.com) already exists.',
  });
  return Object.assign(new Error('Failed query: insert into "candidate" ("email") values ($1)\nparams: ada@example.com,Ada,Lovelace'), {
    name: 'DrizzleQueryError',
    query: 'insert into "candidate" ("email") values ($1)',
    params: ['ada@example.com', 'Ada', 'Lovelace'],
    cause,
  });
};

describe('safeErrorSerializer', () => {
  it('drops parameters, query text and row details of a database error, keeping SQL state, constraint and table', () => {
    const out = safeErrorSerializer(drizzleError());
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/ada@example|Lovelace|params|insert into|Key \(/i);
    expect(out).toMatchObject({ type: 'DrizzleQueryError', code: '23505', constraint: 'candidate_org_email_uidx', table: 'candidate' });
    expect(out.message).toBe('database error 23505');
  });

  it('handles a raw pg error without the Drizzle wrapper', () => {
    const raw = Object.assign(new Error('null value in column "email" of relation "candidate" violates not-null constraint'), { code: '23502', severity: 'ERROR', table: 'candidate', column: 'email', detail: 'Failing row contains (ada@example.com)' });
    const json = JSON.stringify(safeErrorSerializer(raw));
    expect(json).not.toContain('ada@example.com');
    expect(json).toContain('23502');
  });

  it('keeps message and stack of an ordinary error, and walks its cause', () => {
    const out = safeErrorSerializer(new Error('boom', { cause: new Error('inner') }));
    expect(out).toMatchObject({ type: 'Error', message: 'boom', cause: { message: 'inner' } });
    expect(typeof out.stack).toBe('string');
  });

  it('never throws on odd values and never prints a stack that carries the Drizzle message', () => {
    expect(safeErrorSerializer('text')).toMatchObject({ message: 'text' });
    expect(safeErrorSerializer(null)).toMatchObject({ message: 'null' });
    const out = safeErrorSerializer(drizzleError());
    expect(JSON.stringify(out)).not.toContain('Failed query');
  });
});
