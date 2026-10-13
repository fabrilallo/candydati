import { createLogEmailProvider } from './log.js';
import { createResendEmailProvider } from './resend.js';
import { createSmtpEmailProvider } from './smtp.js';
import type { EmailConfig } from './config.js';
import type { EmailProvider } from './types.js';

/** Builds the provider selected by `EMAIL_PROVIDER`. `log` receives only counts, never addresses or bodies. */
export function createEmailProvider(config: EmailConfig, log: (line: string) => void): EmailProvider {
  const { transport } = config;
  if (transport.kind === 'smtp') return createSmtpEmailProvider(transport);
  if (transport.kind === 'resend') return createResendEmailProvider({ apiKey: transport.apiKey });
  return createLogEmailProvider(log);
}
