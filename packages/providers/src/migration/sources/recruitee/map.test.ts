import { describe, expect, it } from 'vitest';
import { createJobCollector, isoDate, mapNote, mapPlacement, stageTypeOf } from './map.js';
import { hitSchema } from './schemas.js';
import { disqualifiedHit, hiredHit, placement, searchHit } from '../../../testing/fixtures/migration/recruitee/search-new-candidates.js';

const parse = (value: unknown) => hitSchema.parse(value);
const NOW = new Date('2025-06-01T00:00:00.000Z');

describe('Recruitee mapping', () => {
  it('gives a closing date no earlier than the application and ignores unreadable dates', () => {
    const hit = parse(disqualifiedHit);
    const early = { ...hit.placements![0]!, disqualified_at: '2020-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z' };
    expect(mapPlacement(hit, early, '2025-01-01T00:00:00.000Z')?.application.closedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(isoDate('not a date')).toBeUndefined();
    expect(isoDate(null)).toBeUndefined();
  });

  it('maps hired by stage and ignores placements without an offer', () => {
    const hit = parse(hiredHit);
    expect(mapPlacement(hit, hit.placements![0]!, '2025-03-01T00:00:00.000Z')?.application.outcome).toBe('hired');
    expect(mapPlacement(hit, parse(searchHit({ placements: [placement({ offer: null })] })).placements![0]!, '2025-03-01T00:00:00.000Z')).toBeNull();
  });

  it('names stage types conservatively', () => {
    expect(stageTypeOf({ name: 'Phone interview', category: 'interview' })).toBe('screening_call');
    expect(stageTypeOf({ name: 'Final round' })).toBe('final_interview');
    expect(stageTypeOf({ name: 'Technical task' })).toBe('technical_interview');
    expect(stageTypeOf({ name: 'Offer' })).toBe('offer');
    expect(stageTypeOf({ name: 'Applied' })).toBeUndefined();
  });

  it('drops empty notes and falls back to the candidate date', () => {
    expect(mapNote({ body: '  ' }, 'candidate-1', '2025-01-01T00:00:00.000Z')).toBeNull();
    expect(mapNote({ text: 'hello', author: { name: 'Sam' } }, 'candidate-1', '2025-01-01T00:00:00.000Z')).toEqual({ candidateRef: 'candidate-1', authorName: 'Sam', body: 'hello', createdAt: '2025-01-01T00:00:00.000Z' });
  });

  it('collects jobs from offers and placements, with a default stage for placements without one', () => {
    const jobs = createJobCollector([], NOW);
    const hit = parse(searchHit({ placements: [placement({ stage: null }), placement({ id: 2, stage: null, offer: { id: 7, title: ' ', status: 'draft' } })] }));
    for (const p of hit.placements!) jobs.notePlacement(p, '2025-03-01T00:00:00.000Z');
    jobs.notePlacement({ id: '3' }, '2025-03-01T00:00:00.000Z');
    expect(jobs.jobs().map((j) => [j.ref, j.title, j.status, j.stages[0]?.ref])).toEqual([['offer-501', 'Backend Developer', 'open', 'applied'], ['offer-7', 'Offer 7', 'draft', 'applied']]);
  });
});
