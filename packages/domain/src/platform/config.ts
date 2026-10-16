import { z } from 'zod';

export const SUPPORTED_LOCALES = ['it', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** Product name used when PLATFORM_NAME is not set. Copy reads the name from config, so a deployment can rebrand. */
export const DEFAULT_PLATFORM_NAME = 'Candydati';

export const DEFAULT_TIME_ZONE = 'Europe/Rome';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const platformEnvSchema = z.object({
  PLATFORM_NAME: z.string().trim().min(1).default(DEFAULT_PLATFORM_NAME),
  PLATFORM_URL: z.url().default('http://localhost:3000'),
  PLATFORM_SUPPORT_EMAIL: z.email().optional(),
  PLATFORM_DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE),
  /** 0-10. Below it an ad is flagged before publication, never blocked (PRODUCT.md §4.3). */
  PLATFORM_AD_QUALITY_THRESHOLD: z.coerce.number().min(0).max(10).default(6),
  /** IANA time zone used for dates in emails (the web app uses `NUXT_PUBLIC_TIME_ZONE` for the screens). */
  PLATFORM_TIME_ZONE: z
    .string()
    .default(DEFAULT_TIME_ZONE)
    .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. Europe/Rome' }),
});

export interface PlatformConfig {
  readonly name: string;
  readonly url: string;
  readonly supportEmail: string | null;
  readonly defaultLocale: Locale;
  readonly adQualityThreshold: number;
  readonly timeZone: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Empty strings count as "not set", so a blank line in `.env` falls back to the default. */
const dropBlank = (env: Env): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())));

export function loadPlatformConfig(env: Env): PlatformConfig {
  const parsed = platformEnvSchema.safeParse(dropBlank(env));
  if (!parsed.success) {
    throw new Error(`Invalid platform configuration: ${z.prettifyError(parsed.error)}`);
  }
  const { data } = parsed;
  return {
    name: data.PLATFORM_NAME,
    url: data.PLATFORM_URL.replace(/\/$/, ''),
    supportEmail: data.PLATFORM_SUPPORT_EMAIL ?? null,
    defaultLocale: data.PLATFORM_DEFAULT_LOCALE,
    adQualityThreshold: data.PLATFORM_AD_QUALITY_THRESHOLD,
    timeZone: data.PLATFORM_TIME_ZONE,
  };
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
