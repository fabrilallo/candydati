import { describe, expect, it } from 'vitest';
import { jobTrafficQuerySchema, jobTrafficSchema, TRAFFIC_MAX_DAYS } from './traffic.js';

describe('jobTrafficQuerySchema', () => {
  it('reads the job and the period', () => {
    const query = jobTrafficQuerySchema.parse({ jobId: 'job-1', from: '2026-10-01T00:00:00Z', to: '2026-10-28T00:00:00Z' });
    expect(query).toEqual({ jobId: 'job-1', from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-28T00:00:00Z') });
  });

  it('refuses a period that ends before it starts, or longer than a year, and an empty job', () => {
    expect(jobTrafficQuerySchema.safeParse({ jobId: 'j', from: '2026-10-02', to: '2026-10-01' }).success).toBe(false);
    const to = new Date('2026-10-28T00:00:00Z');
    const from = new Date(to.getTime() - (TRAFFIC_MAX_DAYS + 1) * 86_400_000);
    expect(jobTrafficQuerySchema.safeParse({ jobId: 'j', from, to }).success).toBe(false);
    expect(jobTrafficQuerySchema.safeParse({ jobId: '', from: to, to }).success).toBe(false);
  });
});

describe('jobTrafficSchema', () => {
  it('accepts daily rows with counts only', () => {
    const dto = {
      jobId: 'j',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-28T00:00:00.000Z',
      rows: [{ day: '2026-10-02', origin: 'linkedin', campaign: '', visits: 3, applications: 1 }],
    };
    expect(jobTrafficSchema.parse(dto)).toEqual(dto);
  });

  it('refuses a day that is not YYYY-MM-DD and a negative count', () => {
    const base = { jobId: 'j', from: 'a', to: 'b' };
    expect(jobTrafficSchema.safeParse({ ...base, rows: [{ day: '2/10/2026', origin: 'x', campaign: '', visits: 1, applications: 0 }] }).success).toBe(false);
    expect(jobTrafficSchema.safeParse({ ...base, rows: [{ day: '2026-10-02', origin: 'x', campaign: '', visits: -1, applications: 0 }] }).success).toBe(false);
  });
});
