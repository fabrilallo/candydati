import type { PublicJobDto, PublicOrganizationDto } from '../job/job.js';
import { careersUrl, jobUrl } from './urls.js';
import { escapeXml, XML_DECLARATION } from './xml.js';

export const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
/** The sitemaps protocol allows no more than this many URLs in one file. */
export const SITEMAP_MAX_ENTRIES = 50_000;

export interface SitemapEntry {
  /** Absolute URL. */
  readonly url: string;
  /** ISO 8601 timestamp or a Date. */
  readonly lastModified?: string | Date;
}

const lastmod = (value: string | Date): string => (typeof value === 'string' ? new Date(value) : value).toISOString();

/** `<urlset>` of the sitemaps protocol. Escapes every URL; refuses more entries than one file may hold. */
export function buildSitemapXml(entries: readonly SitemapEntry[]): string {
  if (entries.length > SITEMAP_MAX_ENTRIES) throw new RangeError(`A sitemap holds at most ${SITEMAP_MAX_ENTRIES} URLs.`);
  const urls = entries.map((entry) =>
    [
      '  <url>',
      `    <loc>${escapeXml(entry.url)}</loc>`,
      ...(entry.lastModified === undefined ? [] : [`    <lastmod>${lastmod(entry.lastModified)}</lastmod>`]),
      '  </url>',
    ].join('\n'),
  );
  return [XML_DECLARATION, `<urlset xmlns="${SITEMAP_NAMESPACE}">`, ...urls, '</urlset>', ''].join('\n');
}

const newest = (dates: readonly string[]): string | undefined => dates.toSorted().at(-1);

/** The careers index plus one entry per published ad; `lastmod` of an ad is its last edit, of the index the newest edit. */
export function careersSitemapEntries(input: {
  readonly organization: PublicOrganizationDto;
  readonly jobs: readonly PublicJobDto[];
  readonly baseUrl: string;
}): readonly SitemapEntry[] {
  const { organization, jobs, baseUrl } = input;
  const indexModified = newest(jobs.map((job) => job.updatedAt));
  return [
    { url: careersUrl(baseUrl, organization.slug), ...(indexModified === undefined ? {} : { lastModified: indexModified }) },
    ...jobs.map((job) => ({ url: jobUrl(baseUrl, organization.slug, job.slug), lastModified: job.updatedAt })),
  ];
}
