import { describe, expect, it } from 'vitest';
import { externalEmbedUrl, externalWatchUrl, parseExternalVideoUrl } from './video.js';

describe('parseExternalVideoUrl', () => {
  it('reads YouTube links in every common form', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      ' https://m.youtube.com/watch?v=dQw4w9WgXcQ ',
    ]) {
      expect(parseExternalVideoUrl(url)).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
    }
  });

  it('reads Vimeo links', () => {
    expect(parseExternalVideoUrl('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', videoId: '76979871' });
    expect(parseExternalVideoUrl('https://player.vimeo.com/video/76979871?h=abc')).toEqual({ provider: 'vimeo', videoId: '76979871' });
    expect(parseExternalVideoUrl('https://vimeo.com/channels/staffpicks/76979871')).toEqual({ provider: 'vimeo', videoId: '76979871' });
  });

  it('refuses other hosts, schemes and malformed ids', () => {
    for (const url of [
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://www.youtube.com/watch?v=short',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/about',
      'not a url',
      'ftp://youtu.be/dQw4w9WgXcQ',
    ]) {
      expect(parseExternalVideoUrl(url)).toBeNull();
    }
  });
});

describe('embed and watch addresses', () => {
  it('builds privacy-friendly players from the id only', () => {
    expect(externalEmbedUrl({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' })).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1');
    expect(externalEmbedUrl({ provider: 'vimeo', videoId: '76979871' })).toBe('https://player.vimeo.com/video/76979871?autoplay=1&dnt=1');
    expect(externalWatchUrl({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' })).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(externalWatchUrl({ provider: 'vimeo', videoId: '76979871' })).toBe('https://vimeo.com/76979871');
  });

  it('builds nothing from a tampered id', () => {
    expect(externalEmbedUrl({ provider: 'youtube', videoId: '"><script>' })).toBeNull();
    expect(externalEmbedUrl({ provider: 'vimeo', videoId: '1/../x' })).toBeNull();
    expect(externalWatchUrl({ provider: 'youtube', videoId: 'x' })).toBeNull();
    expect(externalWatchUrl({ provider: 'vimeo', videoId: 'x' })).toBeNull();
  });
});
