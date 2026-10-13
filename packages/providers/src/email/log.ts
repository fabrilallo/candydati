import { randomUUID } from 'node:crypto';
import type { EmailProvider } from './types.js';

/** Dev fallback: records only that a message would be sent. Never logs addresses, subject or body. */
export function createLogEmailProvider(log: (line: string) => void): EmailProvider {
  return {
    async send(message) {
      const providerMessageId = `log-${randomUUID()}`;
      log(`email (log provider) ${providerMessageId}: ${message.to.length} recipient(s), not sent`);
      return { providerMessageId };
    },
    async domainStatus() {
      return { status: 'unsupported', records: [] };
    },
  };
}
