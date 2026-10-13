import type { PublishedJobContent } from './content.js';
import { ccnlSummary, employmentBenefitLines, protectedCategoriesSentence } from './employment.js';
import type { PublicJobDto, PublicOrganizationDto } from './job.js';
import type { ContractType, SalaryPeriod } from './taxonomy.js';

/** schema.org `employmentType` values accepted by Google for JobPosting. */
const EMPLOYMENT_TYPE: Readonly<Record<ContractType, string>> = {
  permanent: 'FULL_TIME',
  part_time_permanent: 'PART_TIME',
  fixed_term: 'TEMPORARY',
  apprenticeship: 'OTHER',
  internship: 'INTERN',
  freelance: 'CONTRACTOR',
};

const UNIT_TEXT: Readonly<Record<SalaryPeriod, string>> = { year: 'YEAR', month: 'MONTH', day: 'DAY', hour: 'HOUR' };

/** Section titles in the language of the ad; the caller translates them. */
export interface JobPostingHeadings {
  readonly responsibilities: string;
  readonly mustHave: string;
  readonly niceToHave: string;
  readonly technologies: string;
  readonly benefits: string;
  readonly growth: string;
  readonly workLifeBalance: string;
  readonly culture: string;
}

export interface JobPostingInput {
  readonly job: PublicJobDto;
  readonly organization: PublicOrganizationDto;
  /** Canonical public URL of the ad. */
  readonly url: string;
  readonly headings: JobPostingHeadings;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const paragraph = (heading: string, body: string): string =>
  body.length > 0 ? `<h3>${escapeHtml(heading)}</h3><p>${escapeHtml(body)}</p>` : '';

const list = (heading: string, items: readonly string[]): string =>
  items.length > 0 ? `<h3>${escapeHtml(heading)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';

const legalSentence = (content: PublishedJobContent): string => {
  const sentence = protectedCategoriesSentence(content.protectedCategories, content.language);
  return sentence === null ? '' : `<p>${escapeHtml(sentence)}</p>`;
};

/** The ad as the HTML fragment schema.org expects in `description`. Every value is escaped. */
export function jobDescriptionHtml(content: PublishedJobContent, headings: JobPostingHeadings): string {
  return [
    content.summary.length > 0 ? `<p>${escapeHtml(content.summary)}</p>` : '',
    list(headings.responsibilities, content.responsibilities),
    list(headings.mustHave, content.requirements.mustHave),
    list(headings.niceToHave, content.requirements.niceToHave),
    list(headings.technologies, content.technologies),
    ccnlSummary(content.employment) === undefined ? '' : `<p>CCNL: ${escapeHtml(ccnlSummary(content.employment) ?? '')}</p>`,
    list(headings.benefits, [...employmentBenefitLines(content.employment, content.language), ...content.benefits]),
    paragraph(headings.growth, content.growth),
    paragraph(headings.workLifeBalance, content.workLifeBalance),
    paragraph(headings.culture, content.culture),
    legalSentence(content),
  ].join('');
}

const place = (content: PublishedJobContent): Record<string, unknown> => ({
  '@type': 'Place',
  address: {
    '@type': 'PostalAddress',
    ...(content.location.city === undefined ? {} : { addressLocality: content.location.city }),
    addressCountry: content.location.country,
  },
});

const locationFields = (content: PublishedJobContent): Record<string, unknown> =>
  content.workMode === 'remote'
    ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: content.location.country } }
    : { jobLocation: place(content) };

/**
 * schema.org JobPosting with the salary range always present (PRODUCT.md §5). Returns a plain object: the caller
 * serializes it into a `<script type="application/ld+json">` tag, escaping `<` as `<`.
 */
export function buildJobPostingJsonLd({ job, organization, url, headings }: JobPostingInput): Record<string, unknown> {
  const { content } = job;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: content.title,
    description: jobDescriptionHtml(content, headings),
    identifier: { '@type': 'PropertyValue', name: organization.name, value: job.slug },
    datePosted: job.publishedAt,
    url,
    inLanguage: content.language,
    employmentType: EMPLOYMENT_TYPE[content.contractType],
    hiringOrganization: {
      '@type': 'Organization',
      name: organization.name,
      ...(organization.logo === null ? {} : { logo: organization.logo }),
    },
    ...locationFields(content),
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: content.salary.currency,
      value: { '@type': 'QuantitativeValue', minValue: content.salary.min, maxValue: content.salary.max, unitText: UNIT_TEXT[content.salary.period] },
    },
  };
}

/** Safe to place inside a script tag: `</script>` and HTML comments cannot be closed or opened from data. */
export const serializeJsonLd = (data: Record<string, unknown>): string => JSON.stringify(data).replace(/</g, '\\u003c');
