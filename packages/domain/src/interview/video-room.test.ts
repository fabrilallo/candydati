import { describe, expect, it } from 'vitest';
import { videoProviderOf, videoRoomInputSchema } from './video-room.js';

describe('a personal video room', () => {
  it('takes a Meet, Zoom or Teams link and trims it', () => {
    expect(videoRoomInputSchema.parse({ url: '  https://meet.google.com/abc-defg-hij ' })).toEqual({ url: 'https://meet.google.com/abc-defg-hij' });
    expect(videoRoomInputSchema.safeParse({ url: 'https://us02web.zoom.us/j/1234567890?pwd=x' }).success).toBe(true);
  });

  it('refuses what a candidate could not open safely', () => {
    for (const url of ['http://meet.google.com/abc', 'javascript:alert(1)', 'meet.google.com/abc', 'https://user:pass@meet.example.com/a', 'https://10.0.0.1/room', `https://meet.google.com/${'a'.repeat(600)}`]) {
      expect(videoRoomInputSchema.safeParse({ url }).success, url).toBe(false);
    }
    expect(videoRoomInputSchema.safeParse({ url: 'https://meet.google.com/a', extra: 1 }).success).toBe(false);
  });

  it('names the service from the address, for the person to recognize it', () => {
    expect(videoProviderOf('https://meet.google.com/abc-defg-hij')).toBe('meet');
    expect(videoProviderOf('https://us02web.zoom.us/j/123')).toBe('zoom');
    expect(videoProviderOf('https://teams.microsoft.com/l/meetup-join/x')).toBe('teams');
    expect(videoProviderOf('https://teams.live.com/meet/9876')).toBe('teams');
    expect(videoProviderOf('https://whereby.com/acme')).toBe('other');
    expect(videoProviderOf('not a url')).toBe('other');
  });
});
