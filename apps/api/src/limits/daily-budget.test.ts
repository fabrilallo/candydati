import { describe, expect, it } from 'vitest';
import { createDailyBudget, createInMemoryBudgetStore, utcDay } from './daily-budget.js';

describe('daily budget', () => {
  it('spends one unit per call on every line and refuses at the limit, naming the line', async () => {
    let now = new Date('2026-10-14T10:00:00Z');
    const budget = createDailyBudget(createInMemoryBudgetStore(), () => now);
    const lines = [
      { scope: 'mcp_model:key', subject: 'k1', limit: 3 },
      { scope: 'mcp_model:organization', subject: 'o1', limit: 2 },
    ];
    expect(await budget.consume(lines)).toEqual({ allowed: true, exhausted: null });
    expect(await budget.consume(lines)).toEqual({ allowed: true, exhausted: null });
    expect(await budget.consume(lines)).toEqual({ allowed: false, exhausted: 'mcp_model:organization' });
    expect(await budget.consume([{ scope: 'mcp_model:key', subject: 'k2', limit: 3 }])).toMatchObject({ allowed: true });
    now = new Date('2026-10-15T00:00:01Z');
    expect(await budget.consume(lines)).toMatchObject({ allowed: true });
  });

  it('counts by UTC day', () => {
    expect(utcDay(new Date('2026-10-14T23:59:59Z'))).toBe('2026-10-14');
  });
});
