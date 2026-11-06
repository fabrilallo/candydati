import { describe, expect, it } from 'vitest';
import { linkedinEvidence } from './linkedin.js';

const profile = {
  profileUrl: 'https://www.linkedin.com/in/maja',
  fullName: 'Maja Lind',
  headline: 'Senior Backend Engineer at Spotify',
  location: 'Stockholm, Sweden',
  text: 'About\nI build distributed systems in Go and run them on Kubernetes.\nExperience\nSpotify · 4 yrs\nBackend Engineer, payments platform written in Go.',
};

describe('LinkedIn evidence', () => {
  it('quotes, per criterion, the passage of the profile that mentions it, and the location when it matches', () => {
    expect(linkedinEvidence(profile, { keywords: ['Go', 'Kubernetes', 'Rust'], location: 'Stockholm' })).toEqual([
      { criterion: 'Go', text: 'I build distributed systems in Go and run them on Kubernetes.', where: 'LinkedIn' },
      { criterion: 'Kubernetes', text: 'I build distributed systems in Go and run them on Kubernetes.', where: 'LinkedIn' },
      { criterion: 'Stockholm', text: 'Stockholm, Sweden', where: 'LinkedIn' },
    ]);
  });

  it('matches whole words only, so Go is not found inside "Google", and uses the headline too', () => {
    const evidence = linkedinEvidence({ ...profile, headline: 'Engineer at Google', text: '' }, { keywords: ['Go', 'Engineer'], location: null });
    expect(evidence).toEqual([{ criterion: 'Engineer', text: 'Engineer at Google', where: 'LinkedIn' }]);
  });

  it('caps a quoted passage', () => {
    const long = `${'x '.repeat(400)}Go ${'y '.repeat(400)}`;
    expect(linkedinEvidence({ ...profile, headline: null, text: long }, { keywords: ['Go'], location: null })[0]?.text.length).toBeLessThanOrEqual(300);
  });
});

