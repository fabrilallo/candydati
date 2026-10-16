import { describe, expect, it } from 'vitest';
import type { ReportAggregates } from '../../report-ports.js';
import { buildSources } from './sources.js';

const aggregates = (partial: Partial<Pick<ReportAggregates, 'origins' | 'campaigns' | 'visits'>>): ReportAggregates =>
  ({ origins: [], campaigns: [], visits: [], ...partial }) as unknown as ReportAggregates;

describe('buildSources', () => {
  it('adds visits and conversion (applications over visits) to each origin', () => {
    const { sources } = buildSources(
      aggregates({
        origins: [{ origin: 'linkedin', applications: 3, hires: 1 }],
        visits: [
          { origin: 'linkedin', campaign: '', visits: 20 },
          { origin: 'linkedin', campaign: 'autumn', visits: 10 },
        ],
      }),
    );
    expect(sources).toEqual([{ origin: 'linkedin', applications: 3, hires: 1, visits: 30, conversion: 0.1 }]);
  });

  it('keeps an origin that only has visits, and one that only has applications', () => {
    const { sources } = buildSources(
      aggregates({ origins: [{ origin: 'import', applications: 2, hires: 0 }], visits: [{ origin: 'x', campaign: '', visits: 4 }] }),
    );
    expect(sources).toEqual([
      { origin: 'import', applications: 2, hires: 0, visits: 0, conversion: null },
      { origin: 'x', applications: 0, hires: 0, visits: 4, conversion: null },
    ]);
  });

  it('does not divide by zero and may pass 100% (an applicant is not always counted as a visit)', () => {
    const { sources } = buildSources(aggregates({ origins: [{ origin: 'a', applications: 3, hires: 0 }], visits: [{ origin: 'a', campaign: '', visits: 2 }] }));
    expect(sources[0]?.conversion).toBe(1.5);
  });

  it('ranks by applications, then visits, then name', () => {
    const { sources } = buildSources(
      aggregates({
        origins: [{ origin: 'b', applications: 1, hires: 0 }, { origin: 'a', applications: 1, hires: 0 }, { origin: 'c', applications: 2, hires: 0 }],
        visits: [{ origin: 'b', campaign: '', visits: 9 }],
      }),
    );
    expect(sources.map((s) => s.origin)).toEqual(['c', 'b', 'a']);
  });

  it('builds the campaign rows only from labelled visits and applications', () => {
    const { campaigns } = buildSources(
      aggregates({
        campaigns: [{ origin: 'linkedin', campaign: 'autumn', applications: 2, hires: 1 }],
        visits: [
          { origin: 'linkedin', campaign: 'autumn', visits: 8 },
          { origin: 'linkedin', campaign: 'spring', visits: 5 },
          { origin: 'linkedin', campaign: '', visits: 100 },
        ],
      }),
    );
    expect(campaigns).toEqual([
      { origin: 'linkedin', campaign: 'autumn', applications: 2, hires: 1, visits: 8, conversion: 0.25 },
      { origin: 'linkedin', campaign: 'spring', applications: 0, hires: 0, visits: 5, conversion: null },
    ]);
  });
});
