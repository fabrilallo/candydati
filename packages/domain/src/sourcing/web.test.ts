import { describe, expect, it } from 'vitest';
import { personFromWebResult, webEvidence, webResultSchema } from './web.js';

const result = (url: string, title: string, snippet = '') => ({ url, title, snippet });

describe('a person from a Google result', () => {
  it('reads a LinkedIn profile title: first name, the rest as surname, the middle as headline', () => {
    expect(personFromWebResult(result('https://it.linkedin.com/in/giulia-verdi-123?trk=x', 'Giulia Verdi - Backend Engineer - Acme | LinkedIn'))).toEqual({
      source: 'linkedin',
      firstName: 'Giulia',
      lastName: 'Verdi',
      headline: 'Backend Engineer - Acme',
      location: null,
      profileUrl: 'https://www.linkedin.com/in/giulia-verdi-123/',
      handle: 'giulia-verdi-123',
    });
    expect(personFromWebResult(result('https://www.linkedin.com/in/marco/', 'Marco De Santis, PhD – LinkedIn'))).toMatchObject({ firstName: 'Marco', lastName: 'De Santis', headline: null });
    expect(personFromWebResult(result('https://www.linkedin.com/in/anna/', 'Anna | LinkedIn'))).toMatchObject({ firstName: 'Anna', lastName: null });
  });

  it('takes the city from a LinkedIn snippet when Google shows it', () => {
    const found = personFromWebResult(result('https://www.linkedin.com/in/luca/', 'Luca Neri - Go developer | LinkedIn', 'Località: Torino · Esperienza: Acme · Go, Kubernetes'));
    expect(found?.location).toBe('Torino');
    expect(personFromWebResult(result('https://www.linkedin.com/in/luca/', 'Luca Neri | LinkedIn', 'Location: Milan, Lombardy, Italy · 500+ connections'))?.location).toBe('Milan, Lombardy, Italy');
  });

  it('skips LinkedIn pages that are not a profile', () => {
    expect(personFromWebResult(result('https://www.linkedin.com/company/acme/', 'Acme | LinkedIn'))).toBeNull();
    expect(personFromWebResult(result('https://www.linkedin.com/posts/someone_x', 'A post | LinkedIn'))).toBeNull();
  });

  it('reads a GitHub profile, with the name in brackets or none at all, and skips repositories and GitHub pages', () => {
    expect(personFromWebResult(result('https://github.com/gverdi', 'gverdi (Giulia Verdi) · GitHub'))).toEqual({
      source: 'github',
      firstName: 'Giulia',
      lastName: 'Verdi',
      headline: null,
      location: null,
      profileUrl: 'https://github.com/gverdi',
      handle: 'gverdi',
    });
    expect(personFromWebResult(result('https://github.com/rustacean42', 'rustacean42 - Overview · GitHub'))).toMatchObject({ firstName: 'GitHub user', lastName: null, handle: 'rustacean42' });
    expect(personFromWebResult(result('https://github.com/gverdi/tool', 'gverdi/tool: a tool'))).toBeNull();
    expect(personFromWebResult(result('https://github.com/topics/rust', 'rust · GitHub Topics'))).toBeNull();
  });

  it('keeps another page only when its title starts with what looks like a person name', () => {
    expect(personFromWebResult(result('https://giuliaverdi.example/about', 'Giulia Verdi — Software engineer in Torino'))).toEqual({
      source: 'web',
      firstName: 'Giulia',
      lastName: 'Verdi',
      headline: 'Software engineer in Torino',
      location: null,
      profileUrl: 'https://giuliaverdi.example/about',
      handle: null,
    });
    expect(personFromWebResult(result('https://blog.example/rust', 'Rust meetup 2026 in Milano: the talks'))).toBeNull();
    expect(personFromWebResult(result('https://blog.example/home', 'Home'))).toBeNull();
    expect(personFromWebResult(result('https://blog.example/x', 'the best Go jobs - Blog'))).toBeNull();
  });

  it('refuses links that are not http(s)', () => {
    expect(webResultSchema.safeParse(result('javascript:alert(1)', 'Giulia Verdi')).success).toBe(false);
    expect(personFromWebResult(result('notaurl', 'Giulia Verdi'))).toBeNull();
  });
});

describe('web evidence', () => {
  it('is the snippet, capped, with the query as criterion and Google as where; nothing without a snippet', () => {
    expect(webEvidence('site:linkedin.com/in "Go" Torino', 'Backend engineer · Go and Kubernetes')).toEqual([{ criterion: 'site:linkedin.com/in "Go" Torino', text: 'Backend engineer · Go and Kubernetes', where: 'Google result' }]);
    expect(webEvidence('Go', '   ')).toEqual([]);
    const long = webEvidence('x'.repeat(200), 'y'.repeat(900))[0];
    expect(long?.criterion).toHaveLength(80);
    expect(long?.text).toHaveLength(500);
  });
});
