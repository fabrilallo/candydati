import { z } from 'zod';

export const USAGE = [
  'Usage: node dist/demo-seed/cli.js --org <slug or id> [--yes]',
  '',
  'Fills ONE organization with demo data (jobs, candidates, feedback, a client, the careers page).',
  'Without --yes it only prints what it would create. Rerunning it never duplicates anything.',
  'Environment: DATABASE_URL and S3_* (as for the api); DEMO_SEED_ORG and DEMO_SEED=1 can replace the flags.',
].join('\n');

export interface SeedArgs {
  readonly organization: string;
  readonly apply: boolean;
  readonly databaseUrl: string;
}

export type ParsedArgs = { readonly ok: true; readonly value: SeedArgs } | { readonly ok: false; readonly message: string };

/** Blank counts as unset. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()));

const envSchema = z.object({ DATABASE_URL: optionalText, DEMO_SEED_ORG: optionalText, DEMO_SEED: optionalText });

const fail = (message: string): ParsedArgs => ({ ok: false, message: `${message}\n\n${USAGE}` });

interface Flags {
  readonly organization?: string;
  readonly yes: boolean;
  readonly help: boolean;
  readonly unknown?: string;
}

/** `--org x`, `--org=x`, `--yes`, `--help`; anything else is reported, never ignored. */
function readFlags(argv: readonly string[]): Flags {
  const [head, ...rest] = argv;
  if (head === undefined) return { yes: false, help: false };
  const next = (consumed: readonly string[], change: Partial<Flags>): Flags => ({ ...readFlags(consumed), ...change });
  if (head === '--yes' || head === '-y') return { ...readFlags(rest), yes: true };
  if (head === '--help' || head === '-h') return { ...readFlags(rest), help: true };
  if (head === '--org') return next(rest.slice(1), rest[0] === undefined ? {} : { organization: rest[0] });
  if (head.startsWith('--org=')) return next(rest, { organization: head.slice('--org='.length) });
  return { ...readFlags(rest), unknown: head };
}

/** Flags first, the environment as a fallback (handy in a container terminal). Pure. */
export function parseSeedArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ParsedArgs {
  const flags = readFlags(argv);
  if (flags.help) return { ok: false, message: USAGE };
  if (flags.unknown !== undefined) return fail(`Unknown argument: ${flags.unknown}`);
  const parsed = envSchema.parse(env);
  const organization = (flags.organization ?? parsed.DEMO_SEED_ORG ?? '').trim();
  if (organization === '') return fail('Missing the organization (--org <slug or id>).');
  if (parsed.DATABASE_URL === undefined) return fail('DATABASE_URL is not set.');
  const apply = flags.yes || ['1', 'true', 'yes'].includes((parsed.DEMO_SEED ?? '').toLowerCase());
  return { ok: true, value: { organization, apply, databaseUrl: parsed.DATABASE_URL } };
}
