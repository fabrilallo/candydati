import { z } from 'zod';

export const SUPPORTED_LOCALES = ['it', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** Codename shown only when PLATFORM_NAME is not set. The product name is never written in code. */
export const PLATFORM_CODENAME = 'team-tracker';

const platformEnvSchema = z.object({
  PLATFORM_NAME: z.string().trim().min(1).default(PLATFORM_CODENAME),
  PLATFORM_URL: z.url().default('http://localhost:3000'),
  PLATFORM_SUPPORT_EMAIL: z.email().optional(),
  PLATFORM_DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE),
});

export interface PlatformConfig {
  readonly name: string;
  readonly url: string;
  readonly supportEmail: string | null;
  readonly defaultLocale: Locale;
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
  };
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
