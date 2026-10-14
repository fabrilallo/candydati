/**
 * Error reports in the Sentry envelope format (Sentry, GlitchTip, Bugsink and any compatible collector accept it).
 * Pure: building the report is separate from sending it, and what goes into it is decided here, once.
 *
 * Privacy: a report holds the error type, a scrubbed message, the code location of the stack (no variables, no
 * absolute paths) and a few tags. Never a request body, header, cookie, query string, user, breadcrumb or any field
 * of a candidate. Messages lose email addresses, long tokens and anything past a short length.
 */

import { randomUuid } from './uuid.js';

export interface ParsedDsn {
  readonly publicKey: string;
  readonly projectId: string;
  /** `https://host[/prefix]` */
  readonly origin: string;
}

const DSN = /^(https?):\/\/([^:@/\s]+)(?::[^@/\s]*)?@([^/?#\s]+)((?:\/[^/?#\s]+)*)\/([A-Za-z0-9_-]+)\/?$/;

/** `https://<public key>@<host>[/<prefix>]/<project id>`; the secret part of old DSNs is ignored. Null when malformed. */
export function parseDsn(dsn: string): ParsedDsn | null {
  const match = DSN.exec(dsn.trim());
  if (!match) return null;
  const [, protocol, publicKey, host, prefix = '', projectId] = match;
  if (!protocol || !publicKey || !host || !projectId) return null;
  return { publicKey, projectId, origin: `${protocol}://${host}${prefix}` };
}

const MESSAGE_MAX = 300;
const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g;
const LONG_TOKEN = /[A-Za-z0-9_\-+/=]{24,}/g;
const URL_QUERY = /(https?:\/\/[^\s?#]+)[?#][^\s]*/g;

/** An error message as it may leave the server: emails, tokens and URL queries masked, length capped. */
export const scrubMessage = (message: string): string =>
  message
    .replace(EMAIL, '[email]')
    .replace(URL_QUERY, '$1')
    .replace(LONG_TOKEN, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_MAX);

export interface StackFrame {
  readonly function?: string;
  readonly filename: string;
  readonly lineno: number;
  readonly colno: number;
  readonly in_app: boolean;
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const MAX_FRAMES = 50;

/** Keeps the part of the path inside the app or the dependency, so neither a home folder nor a container layout leaks. */
const relativePath = (file: string): string => {
  if (file.startsWith('node:')) return file;
  const clean = file.replace(/^file:\/\//, '');
  const modules = clean.lastIndexOf('/node_modules/');
  if (modules >= 0) return clean.slice(modules + 1);
  const dist = clean.lastIndexOf('/dist/');
  if (dist >= 0) return clean.slice(dist + 1);
  const src = clean.lastIndexOf('/src/');
  if (src >= 0) return clean.slice(src + 1);
  return clean.split('/').pop() ?? clean;
};

/** Frames of a V8 stack, oldest call first (the order Sentry expects). Lines that are not frames are ignored. */
export function stackFrames(stack: string): readonly StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const match = FRAME.exec(line);
    if (!match) continue;
    const [, fn, file = '', lineno = '0', colno = '0'] = match;
    const filename = relativePath(file);
    frames.push({ ...(fn ? { function: fn.slice(0, 120) } : {}), filename, lineno: Number(lineno), colno: Number(colno), in_app: !filename.startsWith('node_modules/') && !file.startsWith('node:') });
  }
  return frames.slice(0, MAX_FRAMES).reverse();
}

/** What a caller may tell about the failure: a short list of tags (service, request id, queue), nothing free-form. */
export type ReportTags = Readonly<Partial<Record<'service' | 'request_id' | 'queue' | 'route' | 'job_id', string | undefined>>>;

export interface ErrorReportInput {
  readonly error: unknown;
  readonly tags?: ReportTags;
  readonly environment?: string | undefined;
  readonly release?: string | undefined;
  /** Replaces the default `{ type, message, stack }` of an error: the api and the worker pass the serializer that strips SQL and bound values. */
  readonly describe?: ((error: unknown) => { readonly type: string; readonly message: string; readonly stack: string }) | undefined;
  readonly now?: Date | undefined;
  readonly eventId?: string | undefined;
}

const TAG_VALUE_MAX = 64;
const SAFE_TAG = /[^A-Za-z0-9._:/-]/g;

const defaultDescribe = (error: unknown) =>
  error instanceof Error ? { type: error.name, message: error.message, stack: error.stack ?? '' } : { type: 'NonError', message: '', stack: '' };

/** The event as a plain object (what the collector stores). Stack frames only: no source lines, no variables. */
export function buildErrorEvent(input: ErrorReportInput): Record<string, unknown> {
  const described = (input.describe ?? defaultDescribe)(input.error);
  const tags = Object.fromEntries(Object.entries(input.tags ?? {}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value).replace(SAFE_TAG, '_').slice(0, TAG_VALUE_MAX)]));
  const frames = stackFrames(described.stack);
  return {
    event_id: input.eventId ?? randomUuid().replaceAll('-', ''),
    timestamp: (input.now ?? new Date()).getTime() / 1000,
    platform: 'node',
    level: 'error',
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.release ? { release: input.release } : {}),
    tags,
    exception: { values: [{ type: described.type.slice(0, 80), value: scrubMessage(described.message), ...(frames.length > 0 ? { stacktrace: { frames } } : {}) }] },
  };
}

export interface ErrorReportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The HTTP request that delivers one event to the collector named by `dsn`. */
export function buildErrorEnvelope(dsn: ParsedDsn, input: ErrorReportInput): ErrorReportRequest {
  const event = buildErrorEvent(input);
  const sentAt = (input.now ?? new Date()).toISOString();
  const body = [JSON.stringify({ event_id: event.event_id, sent_at: sentAt }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  return {
    url: `${dsn.origin}/api/${dsn.projectId}/envelope/`,
    headers: {
      'content-type': 'application/x-sentry-envelope',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_client=tt-error-report/1.0, sentry_key=${dsn.publicKey}`,
    },
    body,
  };
}
