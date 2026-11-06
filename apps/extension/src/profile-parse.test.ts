import { describe, expect, it } from 'vitest';
import { linkedinProfileSchema } from '@candydati/domain';
import { parseProfile } from './profile-parse.js';

const MAIN = ['Maja Lind', 'She/Her', 'Senior Backend Engineer at Spotify', 'Stockholm, Stockholm County, Sweden', 'Contact info', '500+ connections', 'About', 'I build distributed systems in Go.', 'Experience', 'Spotify'].join('\n');

describe('parseProfile', () => {
  it('reads the name, the headline under it, the location and the visible text', () => {
    const profile = parseProfile({ url: 'https://www.linkedin.com/in/maja/', title: '(3) Maja Lind | LinkedIn', heading: 'Maja Lind', main: MAIN });
    expect(profile).toEqual({
      profileUrl: 'https://www.linkedin.com/in/maja/',
      fullName: 'Maja Lind',
      headline: 'Senior Backend Engineer at Spotify',
      location: 'Stockholm, Stockholm County, Sweden',
      text: MAIN,
    });
    expect(linkedinProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('falls back on the page title for the name, and leaves out what it cannot tell', () => {
    const profile = parseProfile({ url: 'https://www.linkedin.com/in/bo/', title: 'Bo Ek | LinkedIn', heading: null, main: 'Bo Ek\nAbout\nNothing here' });
    expect(profile).toMatchObject({ fullName: 'Bo Ek', headline: null, location: null });
  });

  it('gives null when the page is not a profile (no name anywhere) and caps the text', () => {
    expect(parseProfile({ url: 'https://www.linkedin.com/in/x/', title: 'LinkedIn', heading: null, main: '' })).toBeNull();
    expect(parseProfile({ url: 'https://www.linkedin.com/in/maja/', title: 'Maja Lind | LinkedIn', heading: 'Maja Lind', main: 'x'.repeat(50_000) })?.text.length).toBe(20_000);
  });
});
