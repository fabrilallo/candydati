import { describe, expect, it } from 'vitest';
import { type PublishedJobContent, isPublishedContent, jobContentSchema, type JobContentInput } from './content.js';
import type { PublicJobDto, PublicOrganizationDto } from './job.js';
import { buildJobPostingJsonLd, jobDescriptionHtml, type JobPostingHeadings, serializeJsonLd } from './job-posting.js';
import { CONTRACT_TYPES, type ContractType } from './taxonomy.js';

const COMPLETE: JobContentInput = {
  title: 'Backend Developer',
  language: 'it',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
  process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }],
  responseDays: 7,
  summary: 'Costruiamo prodotti.',
  responsibilities: ['Progettare API', 'Scrivere test', 'Monitorare'],
  requirements: { mustHave: ['TypeScript'], niceToHave: ['Go'] },
  technologies: ['Node.js'],
  benefits: ['Buoni pasto'],
  growth: 'Crescita annuale.',
  workLifeBalance: 'Orario flessibile.',
  culture: 'Feedback continuo.',
};

const publishedOf = (overrides: Record<string, unknown>): PublishedJobContent => {
  const content = jobContentSchema.parse({ ...COMPLETE, ...overrides });
  if (!isPublishedContent(content)) throw new Error('fixture is not publishable');
  return content;
};

const HEADINGS: JobPostingHeadings = {
  responsibilities: 'Responsabilità',
  mustHave: 'Requisiti',
  niceToHave: 'Graditi',
  technologies: 'Tecnologie',
  benefits: 'Benefit',
  growth: 'Crescita',
  workLifeBalance: 'Equilibrio',
  culture: 'Cultura',
};

const ORGANIZATION: PublicOrganizationDto = { name: 'Acme', slug: 'acme', logo: null };

const jobOf = (content: PublishedJobContent): PublicJobDto => ({
  slug: 'backend-developer-a1b2c3',
  content,
  publishedAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-14T09:00:00.000Z',
});

const postingOf = (overrides: Record<string, unknown>, organization = ORGANIZATION) =>
  buildJobPostingJsonLd({
    job: jobOf(publishedOf(overrides)),
    organization,
    url: 'https://jobs.example.com/acme/backend-developer-a1b2c3',
    headings: HEADINGS,
  });

describe('buildJobPostingJsonLd', () => {
  it('describes the ad as a schema.org JobPosting', () => {
    const posting = postingOf({});
    expect(posting['@context']).toBe('https://schema.org');
    expect(posting['@type']).toBe('JobPosting');
    expect(posting.title).toBe('Backend Developer');
    expect(posting.datePosted).toBe('2026-10-13T09:00:00.000Z');
    expect(posting.inLanguage).toBe('it');
  });

  it('marks a remote ad as telecommuting, with the country of applicants and no job location', () => {
    const posting = postingOf({ workMode: 'remote', location: { country: 'IT' } });
    expect(posting.jobLocationType).toBe('TELECOMMUTE');
    expect(posting.applicantLocationRequirements).toEqual({ '@type': 'Country', name: 'IT' });
    expect(posting).not.toHaveProperty('jobLocation');
  });

  it('gives a hybrid ad a job location with locality and country', () => {
    const posting = postingOf({});
    expect(posting).not.toHaveProperty('jobLocationType');
    expect(posting.jobLocation).toEqual({
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: 'Milano', addressCountry: 'IT' },
    });
  });

  it('gives an onsite ad a job location', () => {
    const posting = postingOf({ workMode: 'onsite' });
    expect(posting.jobLocation).toEqual(expect.objectContaining({ '@type': 'Place' }));
  });

  it('omits the locality when the ad has no city', () => {
    // A hybrid ad without a city is not publishable, so the builder is fed the shape directly to reach this branch.
    const unpublishable = { ...publishedOf({}), location: { country: 'IT' } } as PublishedJobContent;
    const posting = buildJobPostingJsonLd({
      job: jobOf(unpublishable),
      organization: ORGANIZATION,
      url: 'https://jobs.example.com/acme/x',
      headings: HEADINGS,
    });
    expect(posting.jobLocation).toEqual({
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressCountry: 'IT' },
    });
  });

  it('always carries the salary range with currency and unit', () => {
    const posting = postingOf({});
    expect(posting.baseSalary).toEqual({
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', minValue: 45000, maxValue: 60000, unitText: 'YEAR' },
    });
  });

  it('maps the monthly salary period to MONTH', () => {
    const posting = postingOf({ salary: { min: 3000, max: 4000, currency: 'CHF', period: 'month' } });
    expect(posting.baseSalary).toEqual(expect.objectContaining({ currency: 'CHF' }));
    expect((posting.baseSalary as { value: { unitText: string } }).value.unitText).toBe('MONTH');
  });

  it.each([
    ['permanent', 'FULL_TIME'],
    ['part_time_permanent', 'PART_TIME'],
    ['fixed_term', 'TEMPORARY'],
    ['apprenticeship', 'OTHER'],
    ['internship', 'INTERN'],
    ['freelance', 'CONTRACTOR'],
  ] as const)('maps the contract %s to employmentType %s', (contractType, employmentType) => {
    expect(postingOf({ contractType }).employmentType).toBe(employmentType);
  });

  it('maps every contract type to a non-empty employmentType', () => {
    for (const contractType of CONTRACT_TYPES) {
      const employmentType: ContractType | string = postingOf({ contractType }).employmentType as string;
      expect(employmentType).toEqual(expect.any(String));
      expect(employmentType.length).toBeGreaterThan(0);
    }
  });

  it('omits the logo when the organization has none', () => {
    const posting = postingOf({});
    expect(posting.hiringOrganization).toEqual({ '@type': 'Organization', name: 'Acme' });
  });

  it('includes the logo when the organization has one', () => {
    const posting = postingOf({}, { ...ORGANIZATION, logo: 'https://cdn.example.com/acme.png' });
    expect(posting.hiringOrganization).toEqual({
      '@type': 'Organization',
      name: 'Acme',
      logo: 'https://cdn.example.com/acme.png',
    });
  });
});

describe('jobDescriptionHtml', () => {
  it('renders the sections under their headings', () => {
    const html = jobDescriptionHtml(publishedOf({}), HEADINGS);
    expect(html).toContain('<h3>Responsabilità</h3><ul><li>Progettare API</li>');
    expect(html).toContain('<h3>Requisiti</h3><ul><li>TypeScript</li></ul>');
    expect(html).toContain('<h3>Crescita</h3><p>Crescita annuale.</p>');
  });

  it('escapes HTML in user text', () => {
    const html = jobDescriptionHtml(
      publishedOf({ summary: '<script>alert("x")</script> & \'more\'', responsibilities: ['<img src=x onerror=1>', 'b', 'c'] }),
      HEADINGS,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;more&#39;');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('omits sections that are empty', () => {
    const html = jobDescriptionHtml(publishedOf({ summary: '', growth: '', benefits: [], requirements: { mustHave: ['TS'], niceToHave: [] } }), HEADINGS);
    expect(html).not.toContain('Crescita');
    expect(html).not.toContain('Benefit');
    expect(html).not.toContain('Graditi');
    expect(html).not.toContain('<p></p>');
    expect(html).toContain('Responsabilità');
  });

  it('includes the work-life balance and culture paragraphs when present', () => {
    const html = jobDescriptionHtml(publishedOf({}), HEADINGS);
    expect(html).toContain('<h3>Equilibrio</h3><p>Orario flessibile.</p>');
    expect(html).toContain('<h3>Cultura</h3><p>Feedback continuo.</p>');
  });
});

describe('serializeJsonLd', () => {
  it('never contains a raw < so the script tag cannot be closed from data', () => {
    const serialized = serializeJsonLd({ description: '</script><script>alert(1)</script>', note: '<!-- x -->' });
    expect(serialized).not.toContain('<');
    expect(serialized).toContain('\\u003c/script>');
  });

  it('round-trips to the same data', () => {
    const data = { description: '</script> & "quotes"', nested: { value: 42 } };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('serializes a full job posting without a raw <', () => {
    const posting = postingOf({ summary: '<b>bold</b>' });
    expect(serializeJsonLd(posting)).not.toContain('<');
  });
});
