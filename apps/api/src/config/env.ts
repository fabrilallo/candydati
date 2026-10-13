import { loadPlatformConfig, type PlatformConfig } from '@tt/domain';
import { z } from 'zod';

const splitList = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** Every spelling of "no" turns the flag off, so `off` never silently means `on`. */
const flag = z
  .string()
  .optional()
  .transform((value) => !['false', '0', 'off', 'no'].includes((value ?? '').trim().toLowerCase()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  RUN_MIGRATIONS: flag,
  DATABASE_URL: z.string().min(1, 'is required'),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** The WEB origin: the browser reaches the api through the web app's /api/** proxy. */
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  /** Extra browser origins allowed by CORS and Better Auth (comma-separated URLs). */
  /** Mastra `provider/model` for the ad quality score. Empty = rules only. The provider's API key is set separately. */
  FAST_MODEL: z.string().regex(/^[^/\s]+\/\S+$/, 'must look like provider/model').optional(),
  TRUSTED_ORIGINS: z.string().optional().transform(splitList).pipe(z.array(z.url())),
});

export type Env = Readonly<z.infer<typeof envSchema>> & { readonly platform: PlatformConfig };

type Source = Readonly<Record<string, string | undefined>>;

const withoutEmptyStrings = (source: Source): Source =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

/** Issues name the variable and the rule, never the value: secrets stay out of logs. */
const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('; ');

export function parseEnv(source: Source): Env {
  const clean = withoutEmptyStrings(source);
  const parsed = envSchema.safeParse(clean);
  if (!parsed.success) throw new Error(`Invalid environment: ${describeIssues(parsed.error)}`);
  return Object.freeze({ ...parsed.data, platform: loadPlatformConfig(clean) });
}

export const loadEnv = (): Env => parseEnv(process.env);
