import { textToHtml, type Locale, type NotificationKind } from '@candydati/domain';
import type { EmailSender } from '../../messaging-ports.js';
import type { DigestEntry } from '../automations/scan-deadlines.js';

/** How digests are sent: always from the platform's own identity, never an organization's or a candidate-facing one. */
export interface DigestMailConfig {
  readonly sender: EmailSender;
  /** Formatted From of the platform identity, e.g. `"Platform" <noreply@example.com>`. */
  readonly from: string;
  /** Public base URL of the web app. */
  readonly platformUrl: string;
  readonly locale: Locale;
}

/** `"Platform" <noreply@domain>`: the platform's own identity, never an organization's or a candidate-facing one. */
export const formatDigestFrom = (platformName: string, address: string): string => `"${platformName.replace(/["\\\r\n]/g, ' ')}" <${address}>`;

const ATTENTION_PATH = '/app/attention';

interface Copy {
  readonly subject: (count: number) => string;
  readonly greeting: (name: string) => string;
  readonly intro: string;
  readonly kinds: Readonly<Record<NotificationKind, string>>;
  readonly noJob: string;
  readonly open: string;
}

const COPY: Readonly<Record<Locale, Copy>> = {
  it: {
    subject: (n) => (n === 1 ? '1 novità da gestire' : `${n} novità da gestire`),
    greeting: (name) => `Ciao ${name},`,
    intro: 'Dall’ultimo controllo ci sono novità che richiedono la tua attenzione:',
    kinds: {
      response_due_soon: 'risposta in scadenza',
      response_overdue: 'risposta scaduta',
      task_assigned: 'attività assegnata',
      task_due: 'attività in scadenza',
      job_close_blocked: 'chiusura annuncio bloccata',
      automation_failed: 'automazione non riuscita',
      retention_expiring: 'dati in scadenza per conservazione',
      job_stale: 'annuncio fermo da 90 giorni',
      job_request_submitted: 'richiesta di apertura posizione da valutare',
      job_request_decided: 'richiesta di apertura posizione valutata',
    },
    noJob: 'altro',
    open: 'Apri la lista',
  },
  en: {
    subject: (n) => (n === 1 ? '1 item needs your attention' : `${n} items need your attention`),
    greeting: (name) => `Hi ${name},`,
    intro: 'Since the last check, these need your attention:',
    kinds: {
      response_due_soon: 'response due soon',
      response_overdue: 'response overdue',
      task_assigned: 'task assigned',
      task_due: 'task due',
      job_close_blocked: 'job close blocked',
      automation_failed: 'automation failed',
      retention_expiring: 'data retention expiring',
      job_stale: 'ad idle for 90 days',
      job_request_submitted: 'position request to review',
      job_request_decided: 'position request decided',
    },
    noJob: 'other',
    open: 'Open the list',
  },
};

/** Counts per job and kind. Only job titles and counts: no candidate name or address ever goes into a digest. */
function summarize(entry: DigestEntry, copy: Copy): readonly string[] {
  const counts = new Map<string, number>();
  for (const { jobId, kind } of entry.notifications) {
    const title = jobId ? (entry.jobTitles[jobId] ?? copy.noJob) : copy.noJob;
    const line = `${title}: ${copy.kinds[kind]}`;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts].map(([line, count]) => (count > 1 ? `- ${line} (${count})` : `- ${line}`));
}

export function buildDigestEmail(config: Pick<DigestMailConfig, 'locale' | 'platformUrl'>, entry: DigestEntry): { subject: string; text: string; html: string } {
  const copy = COPY[config.locale];
  const link = `${config.platformUrl.replace(/\/$/, '')}${ATTENTION_PATH}`;
  const text = [copy.greeting(entry.name), copy.intro, summarize(entry, copy).join('\n'), `${copy.open}: ${link}`].join('\n\n');
  return { subject: copy.subject(entry.notifications.length), text, html: textToHtml(text) };
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
