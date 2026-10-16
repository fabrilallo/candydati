import { SUPPORTED_LOCALES, type Locale } from '../platform/config.js';
import type { PublishedJobContent } from '../job/content.js';
import type { PublicJobDto, PublicOrganizationDto } from '../job/job.js';
import { jobDescriptionHtml, type JobPostingHeadings } from '../job/job-posting.js';
import type { ContractType, SalaryPeriod, WorkMode } from '../job/taxonomy.js';
import { careersUrl, jobUrl } from './urls.js';
import { cdataElement, escapeXml, textElement, XML_DECLARATION } from './xml.js';

/** Namespace of our extension elements. A URN: it names the format, not the product. */
export const CANDYDATI_FEED_NAMESPACE = 'urn:candydati:jobs-feed:1';

/** Section titles of the description, per language of the ad. */
export const FEED_HEADINGS: Readonly<Record<Locale, JobPostingHeadings>> = {
  it: {
    responsibilities: 'Cosa farai',
    mustHave: 'Requisiti',
    niceToHave: 'Graditi',
    technologies: 'Tecnologie',
    benefits: 'Benefit',
    growth: 'Crescita',
    workLifeBalance: 'Equilibrio vita-lavoro',
    culture: 'Cultura',
  },
  en: {
    responsibilities: 'What you will do',
    mustHave: 'Requirements',
    niceToHave: 'Nice to have',
    technologies: 'Technologies',
    benefits: 'Benefits',
    growth: 'Growth',
    workLifeBalance: 'Work-life balance',
    culture: 'Culture',
  },
};

const JOB_TYPE: Readonly<Record<ContractType, string>> = {
  permanent: 'fulltime',
  part_time_permanent: 'parttime',
  fixed_term: 'contract',
  apprenticeship: 'temporary',
  internship: 'internship',
  freelance: 'contract',
};

const REMOTE_TYPE: Readonly<Record<WorkMode, string>> = { remote: 'Fully remote', hybrid: 'Hybrid', onsite: 'On-site' };
const PERIOD_TEXT: Readonly<Record<SalaryPeriod, string>> = { year: 'year', month: 'month', day: 'day', hour: 'hour' };

export interface JobsFeedInput {
  readonly organization: PublicOrganizationDto;
  /** Published ads only. Anything else is a caller bug and fails loudly. */
  readonly jobs: readonly PublicJobDto[];
  /** Public site URL, e.g. `https://jobs.example.com`. */
  readonly baseUrl: string;
  readonly now: Date;
  /** Overrides of the section titles, per language. */
  readonly headings?: Readonly<Record<Locale, JobPostingHeadings>>;
}

/** RFC 822 date, the format Indeed-style feeds use. */
const rfc822 = (iso: string): string => new Date(iso).toUTCString();

export const salaryText = (content: PublishedJobContent): string =>
  `${content.salary.min}-${content.salary.max} ${content.salary.currency} per ${PERIOD_TEXT[content.salary.period]}`;

const line = (name: string, value: string | number): string => textElement(name, String(value), '      ');

const jobElement = (job: PublicJobDto, input: JobsFeedInput): string => {
  const { content } = job;
  const headings = (input.headings ?? FEED_HEADINGS)[SUPPORTED_LOCALES.includes(content.language) ? content.language : 'it'];
  const optional = (name: string, value: string | number | undefined) => (value === undefined ? [] : [line(name, value)]);
  const { employment } = content;
  return [
    '    <job>',
    line('title', content.title),
    line('date', rfc822(job.publishedAt)),
    line('referencenumber', job.slug),
    line('url', jobUrl(input.baseUrl, input.organization.slug, job.slug)),
    line('company', input.organization.name),
    ...optional('city', content.location.city),
    line('country', content.location.country),
    cdataElement('description', jobDescriptionHtml(content, headings), '      '),
    line('salary', salaryText(content)),
    line('jobtype', JOB_TYPE[content.contractType]),
    line('remotetype', REMOTE_TYPE[content.workMode]),
    line('candydati:salaryMin', content.salary.min),
    line('candydati:salaryMax', content.salary.max),
    line('candydati:currency', content.salary.currency),
    line('candydati:period', content.salary.period),
    line('candydati:responseDays', content.responseDays),
    line('candydati:stages', content.process.length),
    line('candydati:language', content.language),
    line('candydati:role', content.role),
    line('candydati:seniority', content.seniority),
    line('candydati:contractType', content.contractType),
    line('candydati:workMode', content.workMode),
    ...optional('candydati:ccnl', employment?.ccnl === 'altro' ? (employment.ccnlOther ?? 'altro') : employment?.ccnl),
    ...optional('candydati:level', employment?.level),
    ...optional('candydati:monthlyPayments', employment?.monthlyPayments),
    ...optional('candydati:mealVoucher', employment?.mealVoucher === undefined ? undefined : `${employment.mealVoucher.amountPerDay} ${content.salary.currency} per day (${employment.mealVoucher.type})`),
    ...optional('candydati:welfare', employment?.welfareAnnual === undefined ? undefined : `${employment.welfareAnnual} ${content.salary.currency} per year`),
    line('candydati:updated', rfc822(job.updatedAt)),
    '    </job>',
  ].join('\n');
};

/**
 * The XML feed of an organization's published ads: Indeed-compatible `<source><job>` structure plus our own `candydati:`
 * elements. Every value is escaped (invalid XML characters dropped) and the description is CDATA, split on `]]>`.
 * The caller serves it with `Content-Type: application/xml; charset=utf-8`.
 */
export function buildJobsFeedXml(input: JobsFeedInput): string {
  const { organization, jobs, baseUrl, now } = input;
  return [
    XML_DECLARATION,
    `<source xmlns:candydati="${escapeXml(CANDYDATI_FEED_NAMESPACE)}">`,
    `  <publisher>${escapeXml(organization.name)}</publisher>`,
    `  <publisherurl>${escapeXml(careersUrl(baseUrl, organization.slug))}</publisherurl>`,
    `  <lastBuildDate>${escapeXml(now.toUTCString())}</lastBuildDate>`,
    ...jobs.map((job) => jobElement(job, input)),
    '</source>',
    '',
  ].join('\n');
}
