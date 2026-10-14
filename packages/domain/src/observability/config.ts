import { z } from 'zod';

const envSchema = z.object({
  /** Bearer token that opens `/metrics` on the api and the worker. Unset: no metrics endpoint at all. */
  METRICS_TOKEN: z.string().trim().min(16, 'must be at least 16 characters').optional(),
  /** DSN of a Sentry-compatible collector (Sentry, GlitchTip, Bugsink). Unset: no error is sent anywhere. */
  SENTRY_DSN: z.url({ protocol: /^https?$/, error: 'must be an http(s) DSN' }).optional(),
  /** Environment name attached to error reports. Defaults to NODE_ENV. */
  SENTRY_ENVIRONMENT: z.string().trim().min(1).max(64).optional(),
  /** Release attached to error reports (e.g. the image tag). */
  SENTRY_RELEASE: z.string().trim().min(1).max(64).optional(),
});

export interface ObservabilityConfig {
  readonly metricsToken: string | null;
  readonly sentryDsn: string | null;
  readonly sentryEnvironment: string | null;
  readonly sentryRelease: string | null;
}

type Source = Readonly<Record<string, string | undefined>>;

/** Everything is optional: with nothing set, nothing is exposed and nothing is sent. Messages name variables, never values. */
export function loadObservabilityConfig(source: Source): ObservabilityConfig {
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''));
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid observability configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const { data } = parsed;
  return {
    metricsToken: data.METRICS_TOKEN ?? null,
    sentryDsn: data.SENTRY_DSN ?? null,
    sentryEnvironment: data.SENTRY_ENVIRONMENT ?? null,
    sentryRelease: data.SENTRY_RELEASE ?? null,
  };
}
