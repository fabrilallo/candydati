import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const s3EnvSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3).max(63),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString.default(false),
});

export interface S3Config {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

/** Parses S3_* variables. The error names the variables, never their values. */
export function loadS3Config(env: Readonly<Record<string, string | undefined>>): S3Config {
  const parsed = s3EnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'S3')))];
    throw new Error(`Invalid S3 configuration, check: ${names.join(', ')}`);
  }
  const value = parsed.data;
  return {
    endpoint: value.S3_ENDPOINT,
    region: value.S3_REGION,
    bucket: value.S3_BUCKET,
    accessKeyId: value.S3_ACCESS_KEY,
    secretAccessKey: value.S3_SECRET_KEY,
    forcePathStyle: value.S3_FORCE_PATH_STYLE,
  };
}
