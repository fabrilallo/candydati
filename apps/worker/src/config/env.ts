import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
});

export type WorkerEnv = Readonly<z.infer<typeof envSchema>>;

/** `.env` files often contain `KEY=` for unset values: treat empty strings as absent. */
const withoutEmptyStrings = (
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === '' ? undefined : value]));

/** Describes each failing variable by name only: values (which may be secrets) are never included. */
const describeIssues = (issues: readonly z.core.$ZodIssue[], source: Readonly<Record<string, unknown>>): string =>
  issues
    .map((issue) => {
      const key = issue.path.map(String).join('.') || '(root)';
      const missing = source[key] === undefined && issue.code === 'invalid_type';
      return `${key}: ${missing ? 'missing' : issue.message}`;
    })
    .join('; ');

/** Validates the process environment once at boot. Throws listing every missing or invalid variable. */
export const loadEnv = (source: Readonly<Record<string, string | undefined>>): WorkerEnv => {
  const normalized = withoutEmptyStrings(source);
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(`Invalid worker environment: ${describeIssues(result.error.issues, normalized)}`);
  }
  return Object.freeze(result.data);
};
