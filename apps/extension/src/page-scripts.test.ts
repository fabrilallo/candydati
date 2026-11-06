// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectProfileHrefs, readProfilePage, waitForMain } from './page-scripts.js';

describe('page scripts', () => {
  it('list the profile links of the main section only', () => {
    document.body.innerHTML = '<nav><a href="https://www.linkedin.com/in/me/">Me</a></nav><main><a href="https://www.linkedin.com/in/maja/">Maja</a><a href="https://www.linkedin.com/company/x/">X</a></main>';
    expect(collectProfileHrefs()).toEqual(['https://www.linkedin.com/in/maja/']);
  });

  it('read the title, the name heading and the text, and wait for the main content', async () => {
    document.title = 'Maja Lind | LinkedIn';
    document.body.innerHTML = '<main><h1> Maja Lind </h1><p>Backend engineer</p></main>';
    expect(readProfilePage()).toMatchObject({ title: 'Maja Lind | LinkedIn', heading: 'Maja Lind' });
    expect(await waitForMain()).toBe(true);
  });
});
