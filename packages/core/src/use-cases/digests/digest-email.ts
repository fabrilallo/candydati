import { textToHtml, type Locale, type NotificationKind } from '@candydati/domain';
import type { EmailSender } from '../../messaging-ports.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';
import type { DigestItem } from './digest-details.js';

/** How digests are sent: always from the platform's own identity, never an organization's or a candidate-facing one. */
export interface DigestMailConfig {
  readonly sender: EmailSender;
  /** Formatted From of the platform identity, e.g. `"Platform" <noreply@example.com>`. */
  readonly from: string;
  /** Public base URL of the web app. */
  readonly platformUrl: string;
  readonly locale: Locale;
  /** IANA time zone of the dates in the email (`PLATFORM_TIME_ZONE`); UTC when absent. */
  readonly timeZone?: string | undefined;
}

/** `"Platform" <noreply@domain>`: the platform's own identity, never an organization's or a candidate-facing one. */
export const formatDigestFrom = (platformName: string, address: string): string => `"${platformName.replace(/["\\\r\n]/g, ' ')}" <${address}>`;

const ATTENTION_PATH = '/app/attention';
const TASKS_PATH = '/app/tasks';
/** Day before month in both languages: "3 novembre 2026", "3 November 2026". */
const DATE_LOCALE: Readonly<Record<Locale, string>> = { it: 'it-IT', en: 'en-GB' };

/** The facts of one line, already formatted. */
interface Facts {
  readonly task: string | null;
  readonly date: string | null;
  readonly days: number | null;
}

interface Copy {
  readonly subject: (count: number) => string;
  readonly greeting: (name: string) => string;
  readonly intro: string;
  /** What happened, without the candidate: `who` and `stage` are appended by `line`. */
  readonly what: (kind: NotificationKind, facts: Facts) => string | null;
  readonly kinds: Readonly<Record<NotificationKind, string>>;
  readonly stage: (name: string) => string;
  readonly noJob: string;
  readonly open: string;
}

const IT_KINDS: Readonly<Record<NotificationKind, string>> = {
  response_due_soon: 'Risposta in scadenza',
  response_overdue: 'Risposta scaduta',
  task_assigned: 'Attività assegnata',
  task_due: 'Attività in scadenza',
  job_close_blocked: 'Chiusura annuncio bloccata',
  automation_failed: 'Automazione non riuscita',
  retention_expiring: 'Dati in scadenza per conservazione',
  job_stale: 'Annuncio fermo da 90 giorni',
  job_request_submitted: 'Richiesta di apertura posizione da valutare',
  job_request_decided: 'Richiesta di apertura posizione valutata',
  automation_alert: 'Avviso di un’automazione',
  automation_alert_email: 'Avviso di un’automazione',
  move_proposed: 'Spostamento proposto da confermare',
};

const EN_KINDS: Readonly<Record<NotificationKind, string>> = {
  response_due_soon: 'Response due soon',
  response_overdue: 'Response overdue',
  task_assigned: 'Task assigned',
  task_due: 'Task due',
  job_close_blocked: 'Job close blocked',
  automation_failed: 'Automation failed',
  retention_expiring: 'Data retention expiring',
  job_stale: 'Ad idle for 90 days',
  job_request_submitted: 'Position request to review',
  job_request_decided: 'Position request decided',
  automation_alert: 'Automation alert',
  automation_alert_email: 'Automation alert',
  move_proposed: 'Proposed move to confirm',
};

function itWhat(kind: NotificationKind, { task, date, days }: Facts): string | null {
  if (kind === 'response_overdue' && date) return `Risposta scaduta il ${date}`;
  if (kind === 'response_due_soon' && date) return `Risposta da dare entro il ${date}`;
  if (kind === 'task_due' && task) return `Attività «${task}» in scadenza${date ? ` il ${date}` : ''}`;
  if (kind === 'job_stale' && days !== null) return `Annuncio senza attività da ${days} giorni`;
  if (kind === 'retention_expiring' && date) return `Dati in cancellazione il ${date} (fine conservazione)`;
  return null;
}

function enWhat(kind: NotificationKind, { task, date, days }: Facts): string | null {
  if (kind === 'response_overdue' && date) return `Response overdue since ${date}`;
  if (kind === 'response_due_soon' && date) return `Response due by ${date}`;
  if (kind === 'task_due' && task) return `Task “${task}” due${date ? ` ${date}` : ''}`;
  if (kind === 'job_stale' && days !== null) return `Ad without activity for ${days} days`;
  if (kind === 'retention_expiring' && date) return `Data to be erased on ${date} (end of retention)`;
  return null;
}

const COPY: Readonly<Record<Locale, Copy>> = {
  it: {
    subject: (n) => (n === 1 ? '1 novità da gestire' : `${n} novità da gestire`),
    greeting: (name) => `Ciao ${name},`,
    intro: 'Dall’ultimo controllo ci sono novità che richiedono la tua attenzione:',
    what: itWhat,
    kinds: IT_KINDS,
    stage: (name) => `fase ${name}`,
    noJob: 'Altro',
    open: 'Tutte le candidature in attesa di risposta',
  },
  en: {
    subject: (n) => (n === 1 ? '1 item needs your attention' : `${n} items need your attention`),
    greeting: (name) => `Hi ${name},`,
    intro: 'Since the last check, these need your attention:',
    what: enWhat,
    kinds: EN_KINDS,
    stage: (name) => `stage ${name}`,
    noJob: 'Other',
    open: 'Every application awaiting an answer',
  },
};

interface Format {
  readonly copy: Copy;
  readonly base: string;
  readonly date: (value: Date) => string;
}

/** Where the line leads: the candidate's profile, the ad, the task list or the attention list. */
function pathOf(item: DigestItem): string {
  if (item.candidateId) return `/app/candidates/${item.candidateId}`;
  if (item.kind === 'job_stale' && item.jobId) return `/app/jobs/${item.jobId}`;
  if (item.kind === 'task_due' || item.kind === 'task_assigned') return TASKS_PATH;
  return ATTENTION_PATH;
}

function line(item: DigestItem, { copy, base, date }: Format): string {
  const facts: Facts = { task: item.task, date: item.dueAt ? date(item.dueAt) : null, days: item.daysIdle };
  const what = copy.what(item.kind, facts) ?? copy.kinds[item.kind];
  const about = [item.candidate, item.stage ? copy.stage(item.stage) : null].filter((part) => part !== null).join(', ');
  return `- ${about === '' ? what : `${what}: ${about}`}\n  ${base}${pathOf(item)}`;
}

const byDate = (a: DigestItem, b: DigestItem): number => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);

/** One block per job, the most urgent first; items without a job last. Only first name and surname initial of a candidate. */
function sections(entry: DigestEntry, items: readonly DigestItem[], format: Format): readonly string[] {
  const groups = new Map<string, DigestItem[]>();
  for (const item of items) {
    const title = item.jobId ? (entry.jobTitles[item.jobId] ?? format.copy.noJob) : format.copy.noJob;
    groups.set(title, [...(groups.get(title) ?? []), item]);
  }
  const ordered = [...groups].sort(([a], [b]) => Number(a === format.copy.noJob) - Number(b === format.copy.noJob));
  return ordered.map(([title, group]) => [title, ...[...group].sort(byDate).map((item) => line(item, format))].join('\n'));
}

export function buildDigestEmail(
  config: Pick<DigestMailConfig, 'locale' | 'platformUrl' | 'timeZone'>,
  entry: DigestEntry,
  items: readonly DigestItem[],
): { subject: string; text: string; html: string } {
  const copy = COPY[config.locale];
  const base = config.platformUrl.replace(/\/$/, '');
  const formatter = new Intl.DateTimeFormat(DATE_LOCALE[config.locale], { dateStyle: 'long', timeZone: config.timeZone ?? 'UTC' });
  const format: Format = { copy, base, date: (value) => formatter.format(value) };
  const text = [copy.greeting(entry.name), copy.intro, ...sections(entry, items, format), `${copy.open}: ${base}${ATTENTION_PATH}`].join('\n\n');
  const literals = [entry.name, ...Object.values(entry.jobTitles), ...items.flatMap((i) => [i.candidate, i.task, i.stage].filter((v): v is string => v !== null))];
  return { subject: copy.subject(items.length), text, html: textToHtml(text, { literals }) };
}

/** Digests of the same person from different scans become one entry, so each person gets a single email per run. */
export function mergeDigests(...groups: readonly (readonly DigestEntry[])[]): readonly DigestEntry[] {
  const merged = new Map<string, DigestEntry>();
  for (const entry of groups.flat()) {
    const key = `${entry.organizationId}:${entry.userId}`;
    const found = merged.get(key);
    merged.set(
      key,
      found ? { ...found, notifications: [...found.notifications, ...entry.notifications], jobTitles: { ...found.jobTitles, ...entry.jobTitles } } : entry,
    );
  }
  return [...merged.values()];
}
