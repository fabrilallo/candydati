import type { EmailMessage } from './types.js';

/** Headers sent with a message; never mutates the input. Blank values are dropped. */
export function buildHeaders(message: EmailMessage): Record<string, string> {
  const entries = Object.entries(message.headers ?? {}).filter(([, value]) => value.trim() !== '');
  return Object.fromEntries(entries);
}
