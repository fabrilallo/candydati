import { loadPlatformConfig, type PlatformConfig } from '@tt/domain';
import { loadEmailConfig, loadS3Config, type EmailConfig, type S3Config } from '@tt/providers';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Only an explicit `true` turns it on: private webhook targets are a development convenience. */
const strictFlag = z
  .string()
  .optional()
  .transform((value) => (value ?? '').trim().toLowerCase() === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  /** Mastra `provider/model` for the CV structuring. Empty: only the plain text is extracted. */
  /** `WEBHOOKS_ALLOW_PRIVATE=true`: the SSRF guard lets webhooks reach localhost and private addresses (development only). */
  WEBHOOKS_ALLOW_PRIVATE: strictFlag,
  FAST_MODEL: z.string().regex(/^[^/\s]+\/\S+$/, 'must look like provider/model').optional(),
  /** CV extractions per organization and day that may call the model; beyond it only the text is extracted. */
  CV_MODEL_DAILY_BUDGET: z.coerce.number().int().min(1).default(1000),
  /** Days after which an import that was never committed is purged (proposed people, parsed CVs, uploaded files). */
  IMPORT_STALE_DAYS: z.coerce.number().int().min(1).default(7),
  /** Days published (or dead) outbox events and webhook delivery rows are kept before the daily job deletes them. */
  DELIVERY_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
}).refine((env) => !(env.NODE_ENV === 'production' && env.WEBHOOKS_ALLOW_PRIVATE), {
  path: ['WEBHOOKS_ALLOW_PRIVATE'],
  message: 'must not be true in production (it turns off the protection against requests to internal addresses)',
});

export type WorkerEnv = Readonly<z.infer<typeof envSchema>> & { readonly s3: S3Config; readonly email: EmailConfig; readonly platform: PlatformConfig };

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

/** The error names the S3_* variables, never their values. */
const parseS3 = (source: Readonly<Record<string, string | undefined>>): S3Config => {
  try {
    return loadS3Config(source);
  } catch (error) {
    throw new Error(`Invalid worker environment: ${error instanceof Error ? error.message : 'S3 configuration'}`, { cause: error });
  }
};

/** The error names the EMAIL_* / SMTP_* variables, never their values. The worker serves no webhook: no secret needed. */
const parseEmail = (source: Readonly<Record<string, string | undefined>>): EmailConfig => {
  try {
    return loadEmailConfig(source);
  } catch (error) {
    throw new Error(`Invalid worker environment: ${error instanceof Error ? error.message : 'email configuration'}`, { cause: error });
  }
};

/** Validates the process environment once at boot. Throws listing every missing or invalid variable. */
export const loadEnv = (source: Readonly<Record<string, string | undefined>>): WorkerEnv => {
  const normalized = withoutEmptyStrings(source);
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(`Invalid worker environment: ${describeIssues(result.error.issues, normalized)}`);
  }
  return Object.freeze({
    ...result.data,
    s3: parseS3(normalized),
    email: parseEmail(normalized),
    platform: loadPlatformConfig(normalized),
  });
};
