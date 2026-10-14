import { safeErrorSerializer } from '@tt/core';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

describe('logging a database error', () => {
  it('writes no parameters or query text through pino', () => {
    const lines: string[] = [];
    const log = pino({ serializers: { err: safeErrorSerializer } }, { write: (line: string) => void lines.push(line) });
    const error = Object.assign(new Error('Failed query: select * from "candidate" where email = $1\nparams: ada@example.com'), { query: 'select * from "candidate" where email = $1', params: ['ada@example.com'], cause: Object.assign(new Error('x'), { code: '42P01', table: 'candidate', severity: 'ERROR' }) });
    log.error({ err: error }, 'request failed');
    expect(lines.join('')).not.toMatch(/ada@example|params|select \*/);
    expect(lines.join('')).toContain('42P01');
  });
});
