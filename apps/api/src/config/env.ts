import { loadEmailConfig, loadS3Config, type EmailConfig, type S3Config } from '@tt/providers';
import { API_KEY_MAX_TTL_DAYS, loadPlatformConfig, productionIssues, type PlatformConfig } from '@tt/domain';
import { z } from 'zod';
import { parseTrustProxy } from './trust-proxy.js';

export const SIGNUP_MODES = ['open', 'invite_only'] as const;

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

/** Only an explicit `true` turns it on: private webhook targets are a development convenience, never a default. */
const strictFlag = z
  .string()
  .optional()
  .transform((value) => (value ?? '').trim().toLowerCase() === 'true');

/** A positive whole number with a default: used by the daily caps. */
const dailyCap = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

/** The refusal is a function of two variables, so it lives on the object, not on a field. */
const refuseOpenWebhooksInProduction = (env: { NODE_ENV: string; WEBHOOKS_ALLOW_PRIVATE: boolean }): boolean =>
  !(env.NODE_ENV === 'production' && env.WEBHOOKS_ALLOW_PRIVATE);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  RUN_MIGRATIONS: flag,
  /** `WEBHOOKS_ALLOW_PRIVATE=true`: webhook URLs may be http://localhost and point at private addresses (development only). */
  WEBHOOKS_ALLOW_PRIVATE: strictFlag,
  DATABASE_URL: z.string().min(1, 'is required'),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** The WEB origin: the browser reaches the api through the web app's /api/** proxy. */
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  /** Extra browser origins allowed by CORS and Better Auth (comma-separated URLs). */
  /** Mastra `provider/model` for the ad quality score. Empty = rules only. The provider's API key is set separately. */
  FAST_MODEL: z.string().regex(/^[^/\s]+\/\S+$/, 'must look like provider/model').optional(),
  /** Mastra `provider/model` of the agent. Only the provider name is ever shown (registro dei trattamenti). */
  AGENT_MODEL: z.string().regex(/^[^/\s]+\/\S+$/, 'must look like provider/model').optional(),
  /** Requests per minute allowed to each API key. */
  API_KEY_RATE_LIMIT: z.coerce.number().int().min(1).optional(),
  TRUSTED_ORIGINS: z.string().optional().transform(splitList).pipe(z.array(z.url())),
  /** Proxies whose `X-Forwarded-For` is believed: a hop count or addresses/CIDRs. Default: loopback only. Never "everyone". */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseTrustProxy(value);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'invalid' });
        return z.NEVER;
      }
    }),
  /** Applications the public form accepts per organization and per job in 24 hours. Above it the form answers 429. */
  APPLICATIONS_DAILY_MAX_PER_ORGANIZATION: dailyCap(500),
  APPLICATIONS_DAILY_MAX_PER_JOB: dailyCap(200),
  /** Receipt emails the public form may queue per organization in 24 hours (the form is a way to mail strangers). */
  RECEIPTS_DAILY_MAX_PER_ORGANIZATION: dailyCap(300),
  /** Cloudflare Turnstile secret key. Set: the public application form needs a valid Turnstile answer. Empty = off (default). */
  TURNSTILE_SECRET_KEY: z.string().trim().optional(),
  /** `open`: anyone may create an account. `invite_only`: only with a pending invitation, or the very first account. */
  SIGNUP_MODE: z.enum(SIGNUP_MODES).optional(),
  /** Days a new API key lives when the caller gives no expiry (at most API_KEY_MAX_TTL_DAYS). */
  API_KEY_DEFAULT_TTL_DAYS: z.coerce.number().int().min(1).max(API_KEY_MAX_TTL_DAYS).default(90),
  /** MCP calls of model-backed tools (analyze_job_ad, publish_job) per API key and per organization in a day. */
  MCP_MODEL_DAILY_BUDGET_PER_KEY: dailyCap(200),
  MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION: dailyCap(1000),
  /** Assistant chat requests per person and per organization in a day. */
  ASSISTANT_DAILY_BUDGET_PER_USER: dailyCap(200),
  ASSISTANT_DAILY_BUDGET_PER_ORGANIZATION: dailyCap(2000),
}).refine(refuseOpenWebhooksInProduction, {
  path: ['WEBHOOKS_ALLOW_PRIVATE'],
  message: 'must not be true in production (it turns off the protection against requests to internal addresses)',
});

export type SignupMode = (typeof SIGNUP_MODES)[number];

export type Env = Readonly<Omit<z.infer<typeof envSchema>, 'SIGNUP_MODE'>> & { readonly SIGNUP_MODE: SignupMode } & { readonly platform: PlatformConfig; readonly s3: S3Config; readonly email: EmailConfig };

type Source = Readonly<Record<string, string | undefined>>;

const withoutEmptyStrings = (source: Source): Source =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));

/** Issues name the variable and the rule, never the value: secrets stay out of logs. */
const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`).join('; ');

/** The S3_* variables are required: CVs always go to object storage. The message names variables, never values. */
function parseS3(clean: Source): S3Config {
  try {
    return loadS3Config(clean);
  } catch (error) {
    throw new Error(`Invalid environment: ${error instanceof Error ? error.message : 'S3 configuration'}`, { cause: error });
  }
}

/** The webhook secret is mandatory in production, where the inbound routes are exposed. Names variables, never values. */
function parseEmail(clean: Source, production: boolean): EmailConfig {
  try {
    return loadEmailConfig(clean, { requireWebhookSecret: production });
  } catch (error) {
    throw new Error(`Invalid environment: ${error instanceof Error ? error.message : 'email configuration'}`, { cause: error });
  }
}

export function parseEnv(source: Source): Env {
  const clean = withoutEmptyStrings(source);
  const parsed = envSchema.safeParse(clean);
  if (!parsed.success) throw new Error(`Invalid environment: ${describeIssues(parsed.error)}`);
  const refused = productionIssues(clean);
  if (refused.length > 0) throw new Error(`Invalid environment: ${refused.join('; ')}`);
  const production = parsed.data.NODE_ENV === 'production';
  return Object.freeze({
    ...parsed.data,
    SIGNUP_MODE: parsed.data.SIGNUP_MODE ?? (production ? 'invite_only' : 'open'),
    platform: loadPlatformConfig(clean), s3: parseS3(clean),
    email: parseEmail(clean, production),
  });
}

export const loadEnv = (): Env => parseEnv(process.env);
