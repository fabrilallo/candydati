import { describe, expect, it } from 'vitest';
import { textToHtml } from './html.js';
import { decodeEntities, htmlToText } from './html-text.js';

describe('htmlToText', () => {
  it('drops scripts, styles and tags, and decodes entities', () => {
    const html = '<style>p{}</style><p>Ciao&nbsp;Ada &amp; co</p><script>evil()</script><div>Line<br>two</div>&#65;&#0;&unknown;';
    expect(htmlToText(html)).toBe('Ciao Ada & co\n\nLine\ntwo\n\nA&unknown;');
  });

  it('uses the block break it is given', () => {
    expect(htmlToText('<p>a</p><p>b</p>', { blockBreak: '\n' })).toBe('a\nb');
    expect(htmlToText('<div><p>a</p></div>b')).toBe('a\n\nb');
  });

  it('leaves no markup from tags split around other tags', () => {
    expect(htmlToText('<scr<script>ipt>alert(1)</script>')).not.toContain('<');
    // What a browser shows of it: a stray `<` and the text after the real closing tag, as characters.
    expect(htmlToText('<<script>script>alert(1)<</script>/script>')).toBe('</script>');
    expect(htmlToText('a<scr<b>ipt>b')).toBe('aipt>b');
  });

  it('skips script, style and head whatever the case, the spacing or a missing close', () => {
    expect(htmlToText('<SCRIPT type="x">a</ScRiPt >b')).toBe('b');
    expect(htmlToText('<head><title>T</title><style>x</style></head><body>x</body>')).toBe('x');
    expect(htmlToText('<p>hi</p><script>evil()')).toBe('hi');
    expect(htmlToText('<script>a</scripts>b</script>c')).toBe('c');
  });

  it('reads > inside quoted attributes and comments as part of the markup', () => {
    expect(htmlToText('<a title="x>y" href=\'a>b\'>link</a>')).toBe('link');
    expect(htmlToText('a<!-- x > y -->b<!-- unclosed')).toBe('ab');
    expect(htmlToText('<!DOCTYPE html><?xml version="1.0"?>ok')).toBe('ok');
  });

  it('keeps a < that does not open a tag, and drops a tag that never closes', () => {
    expect(htmlToText('a < b and 3<4')).toBe('a < b and 3<4');
    expect(htmlToText('ok <img src="x"')).toBe('ok');
    expect(htmlToText('<br class="x"/>a<BR>b')).toBe('a\nb');
  });

  it('decodes entities to text that stays text once shown', () => {
    const text = htmlToText('<p>&lt;script&gt;alert(1)&lt;/script&gt; &#x3C;img src=x onerror=alert(1)&#x3E;</p>');
    expect(text).toBe('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(textToHtml(text)).not.toMatch(/<(script|img)/i);
  });

  it('finishes fast on hostile input', () => {
    const started = performance.now();
    htmlToText('<'.repeat(50_000));
    htmlToText('<a'.repeat(25_000));
    htmlToText(`<script>${'</'.repeat(25_000)}`);
    htmlToText(`<a title="${'x'.repeat(50_000)}`);
    htmlToText('&#'.repeat(25_000));
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and keeps unknown or out-of-range ones', () => {
    expect(decodeEntities('&AMP; &#33; &#x41; &unknown; &#99999999; &#0;')).toBe('& ! A &unknown; &#99999999; ');
  });
});
