import { describe, expect, it } from 'vitest';
import { careersPageDocumentSchema, defaultCareersPage, mediaReferences, visibleSections, type CareersPageDocumentInput } from './document.js';
import { CAREERS_FIXTURE_MEDIA as M, careersPageFixture } from './fixtures.js';

const fixture = careersPageFixture();
const parse = (document: unknown) => careersPageDocumentSchema.safeParse(document);
const withSections = (sections: unknown[]): unknown => ({ ...fixture, sections });
const section = (id: string) => fixture.sections.find((candidate) => candidate.id === id)!;
const messages = (document: unknown): string[] => parse(document).error?.issues.map((issue) => issue.message) ?? [];

describe('careersPageDocumentSchema', () => {
  it('accepts a page with one section of every type and fills the defaults', () => {
    const result = parse(fixture);
    expect(result.success).toBe(true);
    expect(result.data?.sections.every((item) => item.visible)).toBe(true);
    expect(result.data?.sections.find((item) => item.type === 'testimonials')).toMatchObject({ title: {} });
  });

  it('is idempotent: what it returns parses to itself (stored JSON is validated again on read)', () => {
    const once = careersPageDocumentSchema.parse(fixture);
    expect(careersPageDocumentSchema.parse(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('accepts the default page', () => {
    expect(parse(defaultCareersPage('Acme')).success).toBe(true);
  });

  it('requires exactly one jobs section', () => {
    expect(messages(withSections([section('hero')]))).toContain('jobs_exactly_one');
    expect(messages(withSections([section('jobs'), { ...section('jobs'), id: 'jobs-2' }]))).toContain('jobs_exactly_one');
  });

  it('allows one hero at most, and only first', () => {
    expect(messages(withSections([section('jobs'), section('hero')]))).toContain('hero_first');
    expect(messages(withSections([section('hero'), { ...section('hero'), id: 'hero-2' }, section('jobs')]))).toContain('hero_at_most_one');
  });

  it('refuses duplicate or unsafe section ids', () => {
    expect(messages(withSections([section('jobs'), { ...section('chi-siamo'), id: 'jobs' }]))).toContain('duplicate_id');
    expect(parse(withSections([section('jobs'), { ...section('chi-siamo'), id: 'Has Space' }])).success).toBe(false);
  });

  it('refuses unknown section types and unknown keys', () => {
    expect(parse(withSections([section('jobs'), { id: 'x', type: 'html', html: '<script>' }])).success).toBe(false);
    expect(parse({ ...fixture, css: 'body{}' }).success).toBe(false);
    expect(parse(withSections([{ ...section('jobs'), onclick: 'x' }])).success).toBe(false);
  });

  it('enforces the item counts of each list', () => {
    const gallery = section('galleria') as Extract<CareersPageDocumentInput['sections'][number], { type: 'gallery' }>;
    expect(messages(withSections([section('jobs'), { ...gallery, images: gallery.images.slice(0, 1) }]))).toContain('gallery_min');
    expect(messages(withSections([section('jobs'), { ...gallery, images: Array(10).fill(gallery.images[0]) }]))).toContain('gallery_max');
    const values = section('valori') as Extract<CareersPageDocumentInput['sections'][number], { type: 'values' }>;
    expect(messages(withSections([section('jobs'), { ...values, items: values.items.slice(0, 2) }]))).toContain('values_min');
  });

  it('requires an alt text for every gallery image', () => {
    const gallery = section('galleria') as Extract<CareersPageDocumentInput['sections'][number], { type: 'gallery' }>;
    const images = [{ imageId: M.image, alt: {} }, gallery.images[1]];
    expect(messages(withSections([section('jobs'), { ...gallery, images }]))).toContain('required');
  });

  it('refuses links that are not http(s)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'example.com']) {
      expect(parse(withSections([section('jobs'), { id: 'l', type: 'links', items: [{ kind: 'website', url }] }])).success).toBe(false);
    }
  });

  it('refuses a raw URL where a media id is expected', () => {
    const hero = { ...section('hero'), background: { kind: 'image', imageId: 'https://evil.example/x.png' } };
    expect(parse(withSections([hero, section('jobs')])).success).toBe(false);
  });

  it('keeps a hero over media dark enough for its white text', () => {
    const hero = { ...section('hero'), overlay: 20 };
    expect(messages(withSections([hero, section('jobs')]))).toContain('overlay_too_low');
    expect(parse(withSections([{ ...hero, background: { kind: 'none' } }, section('jobs')])).success).toBe(true);
  });

  it('refuses a malformed external video id', () => {
    const video = { ...section('video'), source: { kind: 'youtube', videoId: '"><img src=x>' } };
    expect(parse(withSections([section('jobs'), video])).success).toBe(false);
  });

  it('refuses too many sections', () => {
    const texts = Array.from({ length: 24 }, (_, index) => ({ ...section('chi-siamo'), id: `t-${index}` }));
    expect(messages(withSections([section('jobs'), ...texts]))).toContain('too_many_sections');
  });
});

describe('defaultCareersPage', () => {
  it('has the organization name in the headline, the open positions and nothing else', () => {
    const page = defaultCareersPage('Acme', 'en');
    expect(page.defaultLocale).toBe('en');
    expect(page.sections.map((item) => item.type)).toEqual(['hero', 'jobs']);
    expect(page.sections[0]).toMatchObject({ headline: { it: 'Posizioni aperte in Acme', en: 'Open positions at Acme' } });
  });

  it('keeps a long name within the headline limit', () => {
    expect(parse(defaultCareersPage('x'.repeat(300))).success).toBe(true);
  });
});

describe('mediaReferences', () => {
  it('lists every media file once, with its kind', () => {
    expect(mediaReferences(careersPageDocumentSchema.parse(fixture))).toEqual([
      { id: M.video, kind: 'video' },
      { id: M.poster, kind: 'image' },
      { id: M.image, kind: 'image' },
      { id: M.image2, kind: 'image' },
    ]);
  });

  it('includes uploaded videos and external posters', () => {
    const page = careersPageDocumentSchema.parse(
      withSections([section('jobs'), { id: 'v', type: 'video', title: { it: 'V' }, source: { kind: 'upload', videoId: M.video, posterId: M.poster } }, { id: 'y', type: 'video', title: { it: 'Y' }, source: { kind: 'vimeo', videoId: '123', posterId: M.image } }]),
    );
    expect(mediaReferences(page)).toEqual([
      { id: M.video, kind: 'video' },
      { id: M.poster, kind: 'image' },
      { id: M.image, kind: 'image' },
    ]);
  });
});

describe('visibleSections', () => {
  it('leaves hidden sections out', () => {
    const page = careersPageDocumentSchema.parse(withSections([section('hero'), { ...section('chi-siamo'), visible: false }, section('jobs')]));
    expect(visibleSections(page).sections.map((item) => item.id)).toEqual(['hero', 'jobs']);
  });
});
