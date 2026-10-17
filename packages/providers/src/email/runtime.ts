import { INSTANCE_EMAIL_SECRET_CONTEXT, type CredentialsBox, type InstanceEmailRecord } from '@candydati/core';
import type { EmailConfig, EmailTransportConfig } from './config.js';
import { createEmailProvider } from './factory.js';
import { EmailSendError, type EmailProvider } from './types.js';

/** The instance's email settings saved from the app (`instance_email_settings`), with the secret already opened. */
export interface StoredEmailSettings {
  readonly provider: 'smtp' | 'resend';
  readonly smtpHost: string | null;
  readonly smtpPort: number | null;
  readonly smtpSecure: boolean;
  readonly smtpUser: string | null;
  /** The SMTP password or the Resend API key. */
  readonly secret: string | null;
  readonly sendingDomain: string;
  readonly fromLocal: string;
  readonly verifiedAt: Date;
}

export type EmailSource = 'environment' | 'app' | 'none';

/** How the instance sends email right now. `transport` is null while nothing can send. */
export interface EmailSnapshot {
  readonly source: EmailSource;
  readonly transport: EmailTransportConfig | null;
  readonly domain: string | undefined;
  readonly fromLocal: string;
  readonly inboundDomain: string | undefined;
  readonly verifiedAt: Date | null;
}

export interface EmailRuntime {
  /** The settings in force: read synchronously by the messaging config (From and Reply-To domains). */
  snapshot(): EmailSnapshot;
  /** The instance can send email (invitations, publishing and applications are open). */
  ready(): boolean;
  /** Reads the stored settings again; on failure keeps the last good ones. */
  refresh(): Promise<void>;
  /** Sends with the settings in force at each call: a change applies without a restart. */
  readonly provider: EmailProvider;
}

export interface EmailRuntimeDeps {
  /** EMAIL_* of the environment: they win when EMAIL_PROVIDER is set. */
  readonly env: EmailConfig;
  readonly load: () => Promise<StoredEmailSettings | null>;
  readonly log: (line: string) => void;
  readonly createProvider?: (config: EmailConfig, log: (line: string) => void) => EmailProvider;
}

/** The HKDF info of the instance email secret box: a key of its own, distinct from the migration credentials. */
export const INSTANCE_EMAIL_SECRET_INFO = 'candydati:instance-email';

/** The saved settings with their secret opened, for the email runtime of the api and of the worker. */
export const openStoredEmailSettings = (record: InstanceEmailRecord | null, secrets: CredentialsBox): StoredEmailSettings | null =>
  record === null ? null : { ...record, secret: record.secretCiphertext === null ? null : secrets.open(record.secretCiphertext, INSTANCE_EMAIL_SECRET_CONTEXT) };

export const EMAIL_NOT_CONFIGURED_MESSAGE = 'email is not configured on this instance';

export const storedTransport = (stored: StoredEmailSettings): EmailTransportConfig =>
  stored.provider === 'resend'
    ? { kind: 'resend', apiKey: stored.secret ?? '' }
    : { kind: 'smtp', host: stored.smtpHost ?? '', port: stored.smtpPort ?? 0, secure: stored.smtpSecure, user: stored.smtpUser ?? undefined, password: stored.secret ?? undefined };

const resolve = (env: EmailConfig, stored: StoredEmailSettings | null): EmailSnapshot => {
  if (env.fromEnvironment) return { source: 'environment', transport: env.transport, domain: env.domain, fromLocal: env.fromLocal, inboundDomain: env.inboundDomain, verifiedAt: null };
  if (stored === null) return { source: 'none', transport: null, domain: env.domain, fromLocal: env.fromLocal, inboundDomain: env.inboundDomain, verifiedAt: null };
  return { source: 'app', transport: storedTransport(stored), domain: stored.sendingDomain, fromLocal: stored.fromLocal, inboundDomain: env.inboundDomain, verifiedAt: stored.verifiedAt };
};

/**
 * The email settings of a process (api or worker): EMAIL_PROVIDER in the environment wins; else the settings saved
 * from the app; else none, and a send fails with a transient error so queued emails wait for the configuration
 * instead of being dropped. The transport is built once per distinct configuration.
 */
export function createEmailRuntime({ env, load, log, createProvider = createEmailProvider }: EmailRuntimeDeps): EmailRuntime {
  let current = resolve(env, null);
  let built: { readonly key: string; readonly provider: EmailProvider } | null = null;

  const transportProvider = (): EmailProvider | null => {
    if (current.transport === null) return null;
    const key = JSON.stringify(current.transport);
    if (built?.key !== key) built = { key, provider: createProvider({ ...env, transport: current.transport }, log) };
    return built.provider;
  };

  const provider: EmailProvider = {
    get deduplicates() {
      return transportProvider()?.deduplicates === true;
    },
    async send(message) {
      const active = transportProvider();
      if (active === null) throw new EmailSendError(EMAIL_NOT_CONFIGURED_MESSAGE, true);
      return active.send(message);
    },
    async domainStatus(domain) {
      return (await transportProvider()?.domainStatus(domain)) ?? { status: 'unsupported', records: [] };
    },
  };

  return {
    snapshot: () => current,
    ready: () => current.transport !== null,
    provider,
    async refresh() {
      if (env.fromEnvironment) return;
      try {
        current = resolve(env, await load());
      } catch (error) {
        log(`email settings: could not be read, keeping the previous ones (${error instanceof Error ? error.name : 'error'})`);
      }
    },
  };
}
