import { describe, expect, it } from 'vitest';
import { parseSeedArgs, USAGE } from './args.js';

const env = { DATABASE_URL: 'postgres://db/candydati' };

describe('parseSeedArgs', () => {
  it('reads the organization and the confirmation from the flags', () => {
    expect(parseSeedArgs(['--org', 'officina', '--yes'], env)).toEqual({ ok: true, value: { organization: 'officina', apply: true, databaseUrl: env.DATABASE_URL } });
    expect(parseSeedArgs(['--org=officina'], env)).toEqual({ ok: true, value: { organization: 'officina', apply: false, databaseUrl: env.DATABASE_URL } });
  });

  it('reads them from the environment too', () => {
    expect(parseSeedArgs([], { ...env, DEMO_SEED_ORG: 'officina', DEMO_SEED: '1' })).toEqual({ ok: true, value: { organization: 'officina', apply: true, databaseUrl: env.DATABASE_URL } });
    expect(parseSeedArgs([], { ...env, DEMO_SEED_ORG: 'officina', DEMO_SEED: 'true' })).toMatchObject({ ok: true, value: { apply: true } });
    expect(parseSeedArgs([], { ...env, DEMO_SEED_ORG: 'officina', DEMO_SEED: '0' })).toMatchObject({ ok: true, value: { apply: false } });
  });

  it('refuses to run without an organization or a database, and shows the usage', () => {
    expect(parseSeedArgs(['--yes'], env)).toEqual({ ok: false, message: `Missing the organization (--org <slug or id>).\n\n${USAGE}` });
    expect(parseSeedArgs(['--org', 'x'], {})).toEqual({ ok: false, message: `DATABASE_URL is not set.\n\n${USAGE}` });
  });

  it('refuses unknown flags rather than guessing', () => {
    expect(parseSeedArgs(['--org', 'x', '--all'], env)).toEqual({ ok: false, message: `Unknown argument: --all\n\n${USAGE}` });
  });

  it('answers --help with the usage', () => {
    expect(parseSeedArgs(['--help'], env)).toEqual({ ok: false, message: USAGE });
  });
});
