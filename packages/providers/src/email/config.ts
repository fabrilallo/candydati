import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const optional = z.string().optional().transform((value) => (value === '' ? undefined : value));
const WEBHOOK_SECRET_MIN = 32;

const emailEnvSchema = z.object({
  EMAIL_PROVIDER: z.preprocess((value) => (value === '' ? undefined : value), z.enum(['smtp', 'resend', 'log']).default('log')),
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional().or(z.literal('').transform(() => undefined)),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  RESEND_API_KEY: optional,
  EMAIL_DOMAIN: optional,
  EMAIL_FROM_LOCAL: z.string().min(1).default('noreply'),
  EMAIL_INBOUND_DOMAIN: optional,
  INBOUND_WEBHOOK_SECRET: optional,
});

export type EmailTransportConfig =
  | { readonly kind: 'log' }
  | {
      readonly kind: 'smtp';
      readonly host: string;
      readonly port: number;
      readonly secure: boolean;
      readonly user?: string | undefined;
      readonly password?: string | undefined;
    }
  | { readonly kind: 'resend'; readonly apiKey: string };

export interface EmailConfig {
  /** EMAIL_PROVIDER is set: the environment decides, and the settings saved from the app are not used. */
  readonly fromEnvironment: boolean;
  readonly transport: EmailTransportConfig;
  readonly domain?: string | undefined;
  readonly fromLocal: string;
  readonly inboundDomain?: string | undefined;
  readonly webhookSecret?: string | undefined;
}

export interface LoadEmailConfigOptions {
  /** Set when the process exposes an inbound webhook route: the secret becomes mandatory (min 32). */
  readonly requireWebhookSecret?: boolean;
}

function fail(names: Iterable<string>): never {
  throw new Error(`Invalid email configuration, check: ${[...new Set(names)].join(', ')}`);
}

function transportFrom(data: z.infer<typeof emailEnvSchema>): { transport: EmailTransportConfig; missing: string[] } {
  if (data.EMAIL_PROVIDER === 'smtp') {
    const missing = [data.SMTP_HOST ? '' : 'SMTP_HOST', data.SMTP_PORT ? '' : 'SMTP_PORT'].filter(Boolean);
    return {
      missing,
      transport: {
        kind: 'smtp',
        host: data.SMTP_HOST ?? '',
        port: data.SMTP_PORT ?? 0,
        secure: data.SMTP_SECURE,
        user: data.SMTP_USER,
        password: data.SMTP_PASSWORD,
      },
    };
  }
  if (data.EMAIL_PROVIDER === 'resend') {
    return {
      missing: data.RESEND_API_KEY ? [] : ['RESEND_API_KEY'],
      transport: { kind: 'resend', apiKey: data.RESEND_API_KEY ?? '' },
    };
  }
  return { missing: [], transport: { kind: 'log' } };
}

/** Parses EMAIL_* / SMTP_* / RESEND_API_KEY / INBOUND_WEBHOOK_SECRET. Errors name variables, never values. */
export function loadEmailConfig(
  env: Readonly<Record<string, string | undefined>>,
  options: LoadEmailConfigOptions = {},
): EmailConfig {
  const parsed = emailEnvSchema.safeParse(env);
  if (!parsed.success) return fail(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'EMAIL')));
  const data = parsed.data;
  const { transport, missing } = transportFrom(data);
  const secret = data.INBOUND_WEBHOOK_SECRET;
  const secretInvalid =
    secret !== undefined ? secret.length < WEBHOOK_SECRET_MIN : options.requireWebhookSecret === true;
  if (missing.length > 0 || secretInvalid) {
    return fail([...missing, ...(secretInvalid ? ['INBOUND_WEBHOOK_SECRET'] : [])]);
  }
  return {
    fromEnvironment: (env['EMAIL_PROVIDER'] ?? '').trim() !== '',
    transport,
    domain: data.EMAIL_DOMAIN,
    fromLocal: data.EMAIL_FROM_LOCAL,
    inboundDomain: data.EMAIL_INBOUND_DOMAIN,
    webhookSecret: secret,
  };
}
