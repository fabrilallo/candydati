// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectProfileHrefs, readProfilePage, waitForMain } from './page-scripts.js';

/** The shape of a LinkedIn people search result (2026): one list item per person, mutual connections in a paragraph. */
const result = (handle: string, mutual: string): string =>
  `<div role="listitem"><a href="https://www.linkedin.com/in/${handle}/"></a><a href="https://www.linkedin.com/in/${handle}/">Person</a>` +
  `<p><span><a href="https://www.linkedin.com/in/${mutual}/">Contact</a> is a mutual connection</span></p></div>`;

describe('page scripts', () => {
  it('list the profile links of the search results only, not mutual connections nor the navigation', async () => {
    document.body.innerHTML = `<nav><a href="https://www.linkedin.com/in/me/">Me</a></nav><main><section><div role="list">${result('giulia-neri', 'known-1')}${result('marco-blu', 'known-2')}</div></section><a href="https://www.linkedin.com/company/x/">X</a></main>`;
    expect(await collectProfileHrefs()).toEqual([
      'https://www.linkedin.com/in/giulia-neri/',
      'https://www.linkedin.com/in/giulia-neri/',
      'https://www.linkedin.com/in/marco-blu/',
      'https://www.linkedin.com/in/marco-blu/',
    ]);
  });

  it('fall back on every profile link of the main section outside paragraphs when there are no list items', async () => {
    document.body.innerHTML = '<main><a href="https://www.linkedin.com/in/maja/">Maja</a><p><a href="https://www.linkedin.com/in/known/">K</a></p></main>';
    expect(await collectProfileHrefs()).toEqual(['https://www.linkedin.com/in/maja/']);
  });

  it('read the title, the name heading (h1, else the first h2) and the text, and wait for the main content', async () => {
    document.title = 'Maja Lind | LinkedIn';
    document.body.innerHTML = '<main><h1> Maja Lind </h1><p>Backend engineer</p></main>';
    expect(readProfilePage()).toMatchObject({ title: 'Maja Lind | LinkedIn', heading: 'Maja Lind' });
    document.body.innerHTML = '<main><section><h2>Giulia Neri</h2><p>Developer</p></section><section><h2>About</h2></section></main>';
    expect(readProfilePage().heading).toBe('Giulia Neri');
    expect(await waitForMain()).toBe(true);
  });
});
