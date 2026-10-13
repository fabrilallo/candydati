import { DEFAULT_LOCALE, type Locale } from '../platform/config.js';
import type { PublishedJobContent } from '../job/content.js';
import type { PublicJobDto, PublicOrganizationDto } from '../job/job.js';
import { ccnlSummary, monthlyPaymentsText } from '../job/employment.js';
import { salaryText } from './jobs-feed.js';
import { careersUrl, feedUrl, jobUrl } from './urls.js';

interface Texts {
  readonly summary: (organization: string, count: number) => string;
  readonly promiseTitle: string;
  readonly promise: readonly string[];
  readonly positionsTitle: string;
  readonly none: string;
  readonly machineTitle: string;
  readonly feedLabel: string;
  readonly detail: (content: PublishedJobContent, employmentTail: string) => string;
}

/** `, CCNL Commercio e terziario, 5° livello, 14 mensilità` when the ad declares them; empty otherwise. */
const employmentTail = (content: PublishedJobContent, locale: Locale): string => {
  const parts = [
    ccnlSummary(content.employment) === undefined ? undefined : `CCNL ${ccnlSummary(content.employment)}`,
    content.employment?.monthlyPayments === undefined ? undefined : monthlyPaymentsText(content.employment.monthlyPayments, locale),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? '' : `, ${parts.join(', ')}`;
};

const where = (content: PublishedJobContent): string => [content.location.city, content.location.country].filter(Boolean).join(', ');

const TEXTS: Readonly<Record<Locale, Texts>> = {
  it: {
    summary: (organization, count) => `Posizioni aperte presso ${organization}: ${count}. Ogni annuncio dichiara la RAL, le fasi di selezione e i tempi di risposta prima di candidarsi.`,
    promiseTitle: 'Promessa di trasparenza',
    promise: [
      'La retribuzione annua lorda (RAL) è sempre indicata come intervallo.',
      'Le fasi di selezione, chi le conduce e la loro durata sono dichiarate nell\'annuncio.',
      'Ogni candidatura riceve una risposta entro i giorni indicati dopo ogni fase.',
      'Nessuna decisione sui candidati è presa in modo automatico.',
    ],
    positionsTitle: 'Posizioni aperte',
    none: 'Al momento non ci sono posizioni aperte.',
    machineTitle: 'Per le macchine',
    feedLabel: 'Feed XML degli annunci',
    detail: (c, tail) =>
      `${where(c)} (${c.workMode}), ${salaryText(c)}, ${c.process.length} fasi di selezione, risposta entro ${c.responseDays} giorni dopo ogni fase${tail}.`,
  },
  en: {
    summary: (organization, count) => `Open positions at ${organization}: ${count}. Every ad states the salary range, the selection stages and the response time before you apply.`,
    promiseTitle: 'Transparency promise',
    promise: [
      'The gross annual salary is always shown as a range.',
      'Selection stages, who runs them and how long they take are declared in the ad.',
      'Every application gets an answer within the stated days after each stage.',
      'No decision about candidates is taken automatically.',
    ],
    positionsTitle: 'Open positions',
    none: 'There are no open positions right now.',
    machineTitle: 'For machines',
    feedLabel: 'XML feed of the ads',
    detail: (c, tail) =>
      `${where(c)} (${c.workMode}), ${salaryText(c)}, ${c.process.length} selection stages, answer within ${c.responseDays} days after each stage${tail}.`,
  },
};

export interface LlmsTxtInput {
  readonly organization: PublicOrganizationDto;
  readonly jobs: readonly PublicJobDto[];
  readonly baseUrl: string;
  /** Language of the fixed sentences. Defaults to the platform default. */
  readonly locale?: Locale;
}

/** One line of text: no line breaks and no markdown brackets from data. */
const inline = (value: string): string => value.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();

/**
 * Plain-text summary for language models, in the llms.txt layout (title, quote, sections of links): the organization,
 * the transparency promise and one line per open position with salary range, stages, response days and URL.
 */
export function buildLlmsTxt({ organization, jobs, baseUrl, locale = DEFAULT_LOCALE }: LlmsTxtInput): string {
  const t = TEXTS[locale];
  const name = inline(organization.name);
  const positions =
    jobs.length === 0
      ? [t.none]
      : jobs.map(
          (job) => `- [${inline(job.content.title)}](${jobUrl(baseUrl, organization.slug, job.slug)}): ${inline(t.detail(job.content, employmentTail(job.content, locale)))}`,
        );
  return [
    `# ${name}`,
    '',
    `> ${t.summary(name, jobs.length)}`,
    '',
    `## ${t.promiseTitle}`,
    '',
    ...t.promise.map((sentence) => `- ${sentence}`),
    '',
    `## ${t.positionsTitle}`,
    '',
    ...positions,
    '',
    `## ${t.machineTitle}`,
    '',
    `- [${t.feedLabel}](${feedUrl(baseUrl, organization.slug)})`,
    `- [${name}](${careersUrl(baseUrl, organization.slug)})`,
    '',
  ].join('\n');
}
