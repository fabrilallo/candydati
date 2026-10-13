import { describe, expect, it } from 'vitest';
import { escapeHtml, htmlToText, textToHtml } from './html.js';

describe('textToHtml', () => {
  it('escapes markup', () => {
    expect(textToHtml('<script>alert("x")</script> & \'y\'')).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>');
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(textToHtml('a\r\nb\n\n\nc\n\n  \nd')).toBe('<p>a<br>b</p>\n<p>c</p>\n<p>d</p>');
  });

  it('links http(s) URLs only and leaves trailing punctuation outside', () => {
    const html = textToHtml('See https://a.example/x?a=1&b=2. Or (http://b.example), not javascript:alert(1) or ftp://c.example');
    expect(html).toContain('<a href="https://a.example/x?a=1&amp;b=2" rel="noopener noreferrer">https://a.example/x?a=1&amp;b=2</a>.');
    expect(html).toContain('<a href="http://b.example" rel="noopener noreferrer">http://b.example</a>)');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('href="ftp');
  });

  it('cannot leave an attribute through a URL', () => {
    const html = textToHtml('https://a.example/"onmouseover="x');
    expect(html).not.toMatch(/href="[^"]*"onmouseover/);
    expect(html).toContain('&quot;');
  });

  it('returns an empty string for blank text', () => {
    expect(textToHtml('  \n\n ')).toBe('');
    expect(escapeHtml('plain')).toBe('plain');
  });
});

describe('htmlToText', () => {
  it('drops scripts, styles and tags, and decodes entities', () => {
    const html = '<style>p{}</style><p>Ciao&nbsp;Ada &amp; co</p><script>evil()</script><div>Line<br>two</div>&#65;&#0;&unknown;';
    expect(htmlToText(html)).toBe('Ciao Ada & co\n\nLine\ntwo\n\nA&unknown;');
  });
});
