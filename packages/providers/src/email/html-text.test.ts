import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-text.js';

describe('htmlToText', () => {
  it('strips tags, scripts and styles, keeps line breaks and decodes entities', () => {
    const html = '<style>p{}</style><p>Ciao&nbsp;<b>Mario</b> &amp; co</p><p>Riga&#33; &#x41; &unknown;</p>a<br>b<script>x()</script>';
    expect(htmlToText(html)).toBe('Ciao Mario & co\nRiga! A &unknown;\na\nb');
  });
  it('ignores out-of-range numeric entities', () => {
    expect(htmlToText('&#99999999;')).toBe('&#99999999;');
  });
});
