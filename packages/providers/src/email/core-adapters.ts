import { randomBytes } from 'node:crypto';
import type { EmailIdentity, EmailSender, MessagingConfig } from '@candydati/core';
import type { PlatformConfig } from '@candydati/domain';
import type { EmailConfig } from './config.js';
import type { EmailSnapshot } from './runtime.js';
import { EmailSendError, type EmailProvider } from './types.js';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const TOKEN_BYTES = 20;

/** The core port: a permanent provider error carries `permanent: true` so the worker does not retry it. */
export const toEmailSender = (provider: EmailProvider): EmailSender => ({
  // Read at each use: the email runtime switches transports when the settings change.
  get deduplicates() {
    return provider.deduplicates === true;
  },
  async send(email) {
    try {
      return await provider.send({
        from: email.from,
        replyTo: email.replyTo,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.headers,
        idempotencyKey: email.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof EmailSendError) throw Object.assign(new Error(error.message), { permanent: !error.transient });
      throw error;
    }
  },
});

export const toEmailIdentity = (provider: EmailProvider): EmailIdentity => ({
  domainStatus: (domain) => provider.domainStatus(domain),
});

/** 32 chars of base32 lowercase from a CSPRNG: never derived from ids. */
export function newConversationToken(): string {
  const bytes = randomBytes(TOKEN_BYTES);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

export function toMessagingConfig(platform: PlatformConfig, email: EmailConfig): MessagingConfig {
  const emailDomain = email.domain ?? 'localhost';
  return {
    platformName: platform.name,
    platformUrl: platform.url,
    emailFromLocal: email.fromLocal,
    emailDomain,
    emailInboundDomain: email.inboundDomain ?? `inbound.${emailDomain}`,
    defaultLocale: platform.defaultLocale,
    timeZone: platform.timeZone,
  };
}

/**
 * The messaging config of a process whose email settings can change at run time (api, worker): the From and Reply-To
 * domains are read from the email runtime at each use, the rest is fixed.
 */
export function liveMessagingConfig(platform: PlatformConfig, runtime: { snapshot(): EmailSnapshot }): MessagingConfig {
  const domain = (): string => runtime.snapshot().domain ?? 'localhost';
  return {
    platformName: platform.name,
    platformUrl: platform.url,
    get emailFromLocal() {
      return runtime.snapshot().fromLocal;
    },
    get emailDomain() {
      return domain();
    },
    get emailInboundDomain() {
      return runtime.snapshot().inboundDomain ?? `inbound.${domain()}`;
    },
    defaultLocale: platform.defaultLocale,
    timeZone: platform.timeZone,
  };
}
