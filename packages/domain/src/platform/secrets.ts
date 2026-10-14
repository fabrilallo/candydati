/**
 * Strength of the secrets an installation is configured with. Pure: the api and the worker call it at boot in
 * production and refuse to start on a weak value. Messages name the rule, never the value.
 */

/** Minimum lengths per variable (production). */
export const SECRET_MIN_LENGTHS = {
  BETTER_AUTH_SECRET: 32,
  INBOUND_WEBHOOK_SECRET: 32,
  S3_SECRET_KEY: 16,
  DATABASE_URL: 16,
  BOOTSTRAP_TOKEN: 32,
} as const;

/** Values shipped in `.env.example` and the usual defaults: never acceptable in production, whatever their length. */
const EXAMPLE_MARKERS = ['change-me', 'changeme', 'change_me', 'tt-minio-secret', 'minioadmin', 'example'];

const MIN_DISTINCT_CHARACTERS = 8;
/** Bits per character (Shannon, over the value itself). Random base62/hex of 16+ characters is well above 3. */
const MIN_BITS_PER_CHARACTER = 3;

const bitsPerCharacter = (value: string): number => {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  const length = [...value].length;
  return [...counts.values()].reduce((bits, count) => bits - (count / length) * Math.log2(count / length), 0);
};

/** Why `value` is not acceptable as a production secret, or null when it is. */
export function weakSecretReason(value: string, minLength: number): string | null {
  const lowered = value.toLowerCase();
  if (EXAMPLE_MARKERS.some((marker) => lowered.includes(marker))) return 'is an example value: generate a new one (openssl rand -base64 48)';
  if (value.length < minLength) return `must be at least ${minLength} characters`;
  if (new Set(value).size < MIN_DISTINCT_CHARACTERS || bitsPerCharacter(value) < MIN_BITS_PER_CHARACTER) {
    return 'is not random enough: generate one (openssl rand -base64 48)';
  }
  return null;
}

/** The decoded password of a `postgres://` URL, or null when there is none (or the URL does not parse). */
export function databasePasswordOf(url: string): string | null {
  const password = /^[a-z][a-z0-9+.-]*:\/\/[^:@/\s]*:([^@/\s]*)@/i.exec(url)?.[1];
  if (!password) return null;
  try {
    return decodeURIComponent(password);
  } catch {
    return password;
  }
}

type Source = Readonly<Record<string, string | undefined>>;

/** One `NAME: reason` line per weak secret that is set. Variables left unset are the schema's business, not this one's. */
export function productionSecretIssues(env: Source): readonly string[] {
  const candidates: ReadonlyArray<readonly [keyof typeof SECRET_MIN_LENGTHS, string | null | undefined]> = [
    ['BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET],
    ['INBOUND_WEBHOOK_SECRET', env.INBOUND_WEBHOOK_SECRET],
    ['S3_SECRET_KEY', env.S3_SECRET_KEY],
    ['BOOTSTRAP_TOKEN', env.BOOTSTRAP_TOKEN],
    ['DATABASE_URL', env.DATABASE_URL === undefined ? undefined : (databasePasswordOf(env.DATABASE_URL) ?? '')],
  ];
  return candidates.flatMap(([name, value]) => {
    if (value === undefined || value === null) return [];
    const reason = weakSecretReason(value, SECRET_MIN_LENGTHS[name]);
    if (reason === null) return [];
    return [`${name}: ${name === 'DATABASE_URL' ? `the password ${reason}` : reason}`];
  });
}
