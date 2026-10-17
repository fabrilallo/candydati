import { z } from 'zod';
import { isoDate } from './common.js';

/**
 * How the instance sends email (one setting for the whole instance, managed by its first owner and instance admins).
 * `environment`: EMAIL_PROVIDER is set on the server and wins, the app shows it read-only. `app`: configured from the
 * app. `none`: nothing yet, so the instance stays closed to the outside (no invitations, publishing or applications).
 */
export const INSTANCE_EMAIL_SOURCES = ['environment', 'app', 'none'] as const;
export const INSTANCE_EMAIL_PROVIDERS = ['smtp', 'resend'] as const;
/** The `message` of the validation issue that blocks an action while the instance cannot send email. */
export const EMAIL_NOT_CONFIGURED = 'email_not_configured';
/** The `message` of the validation issue (path `test`) when the provider refused the test email: nothing was saved. */
export const EMAIL_TEST_FAILED = 'email_test_failed';

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const sendingDomain = z.string().trim().toLowerCase().regex(DOMAIN, 'not a domain name');
const fromLocal = z.string().trim().regex(/^[a-z0-9][a-z0-9._+-]{0,63}$/i, 'not the local part of an address').default('noreply');
const text = (max: number) => z.string().trim().min(1).max(max);

/** `PUT /api/v1/instance/email-settings`: saved only once a test email to the admin went through. A secret left out keeps the stored one. */
export const instanceEmailSettingsInputSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('smtp'),
    smtp: z.object({
      host: text(255),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().trim().max(255).optional(),
      password: z.string().min(1).max(1024).optional(),
    }),
    sendingDomain,
    fromLocal,
  }),
  z.object({
    provider: z.literal('resend'),
    resend: z.object({ apiKey: text(512).optional() }),
    sendingDomain,
    fromLocal,
  }),
]);
export type InstanceEmailSettingsInput = z.infer<typeof instanceEmailSettingsInputSchema>;

/** `GET /api/v1/instance/email-settings`: never a secret, only whether one is stored. */
export const instanceEmailSettingsSchema = z.object({
  source: z.enum(INSTANCE_EMAIL_SOURCES),
  /** The instance can send email: invitations, publishing and applications are open. */
  ready: z.boolean(),
  /** The viewer may change it (first owner or instance admin, and not set by the environment). */
  canManage: z.boolean(),
  provider: z.enum(INSTANCE_EMAIL_PROVIDERS).nullable(),
  smtp: z.object({ host: z.string(), port: z.number().int(), secure: z.boolean(), user: z.string(), hasPassword: z.boolean() }).nullable(),
  resend: z.object({ hasApiKey: z.boolean() }).nullable(),
  sendingDomain: z.string().nullable(),
  fromLocal: z.string(),
  /** When the last test email went through (app source only). */
  verifiedAt: isoDate.nullable(),
});
export type InstanceEmailSettingsDto = z.infer<typeof instanceEmailSettingsSchema>;
