// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readGoogleResults } from './google-page-scripts.js';

/** The shape of an organic Google result (2026), with synthetic people only. */
const organic = (href: string, title: string, snippet: string): string =>
  `<div class="g" data-hveid="x"><div><a href="${href}"><h3>${title}</h3><cite>${href}</cite></a></div><div class="VwiC3b">${snippet}</div></div>`;

describe('Google page scripts', () => {
  it('read the organic results in order, without ads nor "People also ask"', () => {
    document.body.innerHTML =
      `<div id="tads"><a href="https://ads.example/"><h3>Hire Go developers</h3></a></div>` +
      `<div id="rso">${organic('https://www.linkedin.com/in/giulia-verdi/', 'Giulia Verdi - Go developer | LinkedIn', 'Località: Torino · Go')}` +
      `<div class="related-question-pair"><a href="https://q.example/"><h3>Who writes Go?</h3></a></div>` +
      `${organic('https://github.com/gverdi', 'gverdi (Giulia Verdi) · GitHub', 'Rust and Go')}</div>`;
    expect(readGoogleResults()).toEqual([
      { href: 'https://www.linkedin.com/in/giulia-verdi/', title: 'Giulia Verdi - Go developer | LinkedIn', snippet: 'Località: Torino · Go' },
      { href: 'https://github.com/gverdi', title: 'gverdi (Giulia Verdi) · GitHub', snippet: 'Rust and Go' },
    ]);
  });

  it('fall back on the text of the result outside its link when no snippet is marked, and skip titles without a link', () => {
    document.body.innerHTML = '<div id="search"><div><div><a href="https://luca.example/"><h3>Luca Neri</h3></a><span>Rust in Milano</span></div><div><h3>Not a link</h3></div></div></div>';
    expect(readGoogleResults()).toEqual([{ href: 'https://luca.example/', title: 'Luca Neri', snippet: 'Rust in Milano' }]);
  });
});
