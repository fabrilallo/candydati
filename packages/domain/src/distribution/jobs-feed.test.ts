import { describe, expect, it } from 'vitest';
import { buildJobsFeedXml, FEED_HEADINGS, TT_FEED_NAMESPACE } from './jobs-feed.js';
import { BASE_URL, ORGANIZATION, publicJob } from './testing.js';
import { childText, childrenNamed, parseXml, type XmlElement } from './xml-reader.js';

const NOW = new Date('2026-10-15T08:30:00.000Z');
const build = (jobs = [publicJob()], organization = ORGANIZATION) => buildJobsFeedXml({ organization, jobs, baseUrl: BASE_URL, now: NOW });
const jobsOf = (root: XmlElement) => childrenNamed(root, 'job');

describe('buildJobsFeedXml', () => {
  it('is well-formed and has the Indeed structure plus the tt namespace', () => {
    const root = parseXml(build());
    expect(root.name).toBe('source');
    expect(root.attributes['xmlns:tt']).toBe(TT_FEED_NAMESPACE);
    expect(childText(root, 'publisher')).toBe('Acme');
    expect(childText(root, 'publisherurl')).toBe('https://jobs.example.com/careers/acme');
    expect(childText(root, 'lastBuildDate')).toBe('Thu, 15 Oct 2026 08:30:00 GMT');
    expect(jobsOf(root)).toHaveLength(1);
  });

  it('writes every field of an ad', () => {
    const [job] = jobsOf(parseXml(build()));
    const field = (name: string) => childText(job!, name);
    expect(field('title')).toBe('Backend Developer');
    expect(field('date')).toBe('Tue, 13 Oct 2026 09:00:00 GMT');
    expect(field('referencenumber')).toBe('backend-developer-a1b2c3');
    expect(field('url')).toBe('https://jobs.example.com/careers/acme/backend-developer-a1b2c3');
    expect(field('company')).toBe('Acme');
    expect(field('city')).toBe('Milano');
    expect(field('country')).toBe('IT');
    expect(field('salary')).toBe('45000-60000 EUR per year');
    expect(field('jobtype')).toBe('fulltime');
    expect(field('remotetype')).toBe('Hybrid');
    expect(field('tt:salaryMin')).toBe('45000');
    expect(field('tt:salaryMax')).toBe('60000');
    expect(field('tt:currency')).toBe('EUR');
    expect(field('tt:period')).toBe('year');
    expect(field('tt:responseDays')).toBe('7');
    expect(field('tt:stages')).toBe('2');
    expect(field('tt:role')).toBe('backend_developer');
    expect(field('tt:updated')).toBe('Wed, 14 Oct 2026 09:00:00 GMT');
  });

  it('puts the same escaped HTML as the JSON-LD in the description, in the language of the ad', () => {
    const it = childText(jobsOf(parseXml(build()))[0]!, 'description');
    expect(it).toContain(`<h3>${FEED_HEADINGS.it.responsibilities}</h3><ul><li>Progettare API</li>`);
    const en = childText(jobsOf(parseXml(build([publicJob({ language: 'en' })])))[0]!, 'description');
    expect(en).toContain(`<h3>${FEED_HEADINGS.en.responsibilities}</h3>`);
  });

  it('keeps special characters and ]]> from breaking the document or the description', () => {
    const nasty = `R&D <b>"x"</b> 'y' ]]> </description></job><job>`;
    const xml = build(
      [publicJob({ title: nasty, summary: nasty, responsibilities: [nasty, 'b', 'c'], location: { country: 'IT', city: nasty, onsiteDaysPerWeek: 1 } })],
      { name: nasty, slug: 'acme', logo: null },
    );
    const root = parseXml(xml);
    expect(jobsOf(root)).toHaveLength(1);
    const [job] = jobsOf(root);
    expect(childText(job!, 'title')).toBe(nasty);
    expect(childText(job!, 'city')).toBe(nasty);
    expect(childText(root, 'publisher')).toBe(nasty);
    expect(childText(job!, 'description')).toContain('R&amp;D &lt;b&gt;&quot;x&quot;&lt;/b&gt; &#39;y&#39; ]]&gt;');
  });

  it('drops control characters instead of emitting a document no parser accepts', () => {
    const root = parseXml(build([publicJob({ title: 'Back\u0000end\u0008 Dev' })]));
    expect(childText(jobsOf(root)[0]!, 'title')).toBe('Backend Dev');
  });

  it('leaves out the city of a remote ad and maps the contract and work mode', () => {
    const job = jobsOf(
      parseXml(build([publicJob({ workMode: 'remote', location: { country: 'IT' }, contractType: 'part_time_permanent' })])),
    )[0]!;
    expect(childText(job, 'city')).toBeUndefined();
    expect(childText(job, 'remotetype')).toBe('Fully remote');
    expect(childText(job, 'jobtype')).toBe('parttime');
    expect(childText(job, 'tt:contractType')).toBe('part_time_permanent');
  });

  it('is a valid, empty feed without ads and escapes slugs in URLs', () => {
    const empty = parseXml(build([]));
    expect(jobsOf(empty)).toHaveLength(0);
    const odd = parseXml(buildJobsFeedXml({ organization: { ...ORGANIZATION, slug: 'a b&c' }, jobs: [publicJob({}, 'x&y')], baseUrl: `${BASE_URL}/`, now: NOW }));
    expect(childText(jobsOf(odd)[0]!, 'url')).toBe('https://jobs.example.com/careers/a%20b%26c/x%26y');
  });

  it('accepts custom headings and several ads in order', () => {
    const headings = { it: { ...FEED_HEADINGS.it, responsibilities: 'Compiti' }, en: FEED_HEADINGS.en };
    const xml = buildJobsFeedXml({ organization: ORGANIZATION, jobs: [publicJob({}, 'a'), publicJob({}, 'b')], baseUrl: BASE_URL, now: NOW, headings });
    const jobs = jobsOf(parseXml(xml));
    expect(jobs.map((job) => childText(job, 'referencenumber'))).toEqual(['a', 'b']);
    expect(childText(jobs[0]!, 'description')).toContain('<h3>Compiti</h3>');
  });
});
