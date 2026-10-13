import { SUPPORTED_LOCALES, type Locale } from '../platform/config.js';
import type { PublishedJobContent } from '../job/content.js';
import type { PublicJobDto, PublicOrganizationDto } from '../job/job.js';
import { jobDescriptionHtml, type JobPostingHeadings } from '../job/job-posting.js';
import type { ContractType, SalaryPeriod, WorkMode } from '../job/taxonomy.js';
import { careersUrl, jobUrl } from './urls.js';
import { cdataElement, escapeXml, textElement, XML_DECLARATION } from './xml.js';

/** Namespace of our extension elements. A URN: it names the format, not the product. */
export const TT_FEED_NAMESPACE = 'urn:tt:jobs-feed:1';

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
    line('tt:salaryMin', content.salary.min),
    line('tt:salaryMax', content.salary.max),
    line('tt:currency', content.salary.currency),
    line('tt:period', content.salary.period),
    line('tt:responseDays', content.responseDays),
    line('tt:stages', content.process.length),
    line('tt:language', content.language),
    line('tt:role', content.role),
    line('tt:seniority', content.seniority),
    line('tt:contractType', content.contractType),
    line('tt:workMode', content.workMode),
    ...optional('tt:ccnl', employment?.ccnl === 'altro' ? (employment.ccnlOther ?? 'altro') : employment?.ccnl),
    ...optional('tt:level', employment?.level),
    ...optional('tt:monthlyPayments', employment?.monthlyPayments),
    ...optional('tt:mealVoucher', employment?.mealVoucher === undefined ? undefined : `${employment.mealVoucher.amountPerDay} ${content.salary.currency} per day (${employment.mealVoucher.type})`),
    ...optional('tt:welfare', employment?.welfareAnnual === undefined ? undefined : `${employment.welfareAnnual} ${content.salary.currency} per year`),
    line('tt:updated', rfc822(job.updatedAt)),
    '    </job>',
  ].join('\n');
};

/**
 * The XML feed of an organization's published ads: Indeed-compatible `<source><job>` structure plus our own `tt:`
 * elements. Every value is escaped (invalid XML characters dropped) and the description is CDATA, split on `]]>`.
 * The caller serves it with `Content-Type: application/xml; charset=utf-8`.
 */
export function buildJobsFeedXml(input: JobsFeedInput): string {
  const { organization, jobs, baseUrl, now } = input;
  return [
    XML_DECLARATION,
    `<source xmlns:tt="${escapeXml(TT_FEED_NAMESPACE)}">`,
    `  <publisher>${escapeXml(organization.name)}</publisher>`,
    `  <publisherurl>${escapeXml(careersUrl(baseUrl, organization.slug))}</publisherurl>`,
    `  <lastBuildDate>${escapeXml(now.toUTCString())}</lastBuildDate>`,
    ...jobs.map((job) => jobElement(job, input)),
    '</source>',
    '',
  ].join('\n');
}
