import { describe, expect, it } from 'vitest';
import { buildSitemapXml, careersSitemapEntries, SITEMAP_MAX_ENTRIES } from './sitemap.js';
import { BASE_URL, ORGANIZATION, publicJob } from './testing.js';
import { childText, childrenNamed, parseXml } from './xml-reader.js';

describe('buildSitemapXml', () => {
  it('is a well-formed urlset with escaped URLs and optional lastmod', () => {
    const root = parseXml(
      buildSitemapXml([
        { url: 'https://x.test/a?b=1&c=<2>', lastModified: new Date('2026-10-14T09:00:00Z') },
        { url: 'https://x.test/b', lastModified: '2026-10-13T09:00:00.000Z' },
        { url: 'https://x.test/c' },
      ]),
    );
    expect(root.name).toBe('urlset');
    expect(root.attributes['xmlns']).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
    const urls = childrenNamed(root, 'url');
    expect(urls.map((url) => childText(url, 'loc'))).toEqual(['https://x.test/a?b=1&c=<2>', 'https://x.test/b', 'https://x.test/c']);
    expect(urls.map((url) => childText(url, 'lastmod'))).toEqual(['2026-10-14T09:00:00.000Z', '2026-10-13T09:00:00.000Z', undefined]);
  });

  it('refuses more URLs than the protocol allows', () => {
    const entries = Array.from({ length: SITEMAP_MAX_ENTRIES + 1 }, (_, i) => ({ url: `https://x.test/${i}` }));
    expect(() => buildSitemapXml(entries)).toThrow(RangeError);
  });
});

describe('careersSitemapEntries', () => {
  it('lists the careers index and every ad with stable path URLs', () => {
    const entries = careersSitemapEntries({
      organization: ORGANIZATION,
      jobs: [publicJob({}, 'a'), { ...publicJob({}, 'b'), updatedAt: '2026-11-01T00:00:00.000Z' }],
      baseUrl: BASE_URL,
    });
    expect(entries).toEqual([
      { url: 'https://jobs.example.com/careers/acme', lastModified: '2026-11-01T00:00:00.000Z' },
      { url: 'https://jobs.example.com/careers/acme/a', lastModified: '2026-10-14T09:00:00.000Z' },
      { url: 'https://jobs.example.com/careers/acme/b', lastModified: '2026-11-01T00:00:00.000Z' },
    ]);
  });

  it('has only the index without ads, and no lastmod', () => {
    expect(careersSitemapEntries({ organization: ORGANIZATION, jobs: [], baseUrl: BASE_URL })).toEqual([{ url: 'https://jobs.example.com/careers/acme' }]);
  });
});
