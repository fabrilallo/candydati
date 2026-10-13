import { describe, expect, it } from 'vitest';
import { jobContentSchema, selectionStageSchema, type SelectionStage } from './content.js';
import { assignStageIds, DuplicateStageIdError } from './stage-ids.js';

const base = { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' } as const;
const withId = (id: string): SelectionStage => ({ ...base, id });

const counter = (): (() => string) => {
  let n = 0;
  return () => `stg-new${(n += 1)}`;
};

describe('selectionStageSchema id and title', () => {
  it('accepts a stage without id and title', () => {
    expect(selectionStageSchema.parse(base)).toEqual(base);
  });

  it('accepts a valid id and trims the title', () => {
    expect(selectionStageSchema.parse({ ...base, id: 'stage-0', title: '  Chiacchierata  ' })).toMatchObject({ id: 'stage-0', title: 'Chiacchierata' });
  });

  it.each(['', 'Upper', 'with space', 'a'.repeat(41), 'under_score'])('rejects the id %j', (id) => {
    expect(selectionStageSchema.safeParse({ ...base, id }).success).toBe(false);
  });

  it('rejects an empty or too long title', () => {
    expect(selectionStageSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
    expect(selectionStageSchema.safeParse({ ...base, title: 'a'.repeat(81) }).success).toBe(false);
  });

  it('is part of the content schema', () => {
    const parsed = jobContentSchema.parse({ title: 'x', process: [withId('abc')] });
    expect(parsed.process[0]?.id).toBe('abc');
  });
});

describe('assignStageIds', () => {
  it('keeps existing ids and gives fresh ones to the others', () => {
    const result = assignStageIds([withId('stage-0'), base, withId('keep')], counter());
    expect(result.map((s) => s.id)).toEqual(['stage-0', 'stg-new1', 'keep']);
  });

  it('does not mutate the input', () => {
    const input = [base];
    const snapshot = structuredClone(input);
    const result = assignStageIds(input, counter());
    expect(input).toEqual(snapshot);
    expect(result[0]).not.toBe(input[0]);
  });

  it('never hands out an id already used by another stage', () => {
    const ids = ['stg-a', 'stg-a', 'stg-b'];
    const newId = () => ids.shift() ?? 'stg-z';
    const result = assignStageIds([withId('stg-a'), base, base], newId);
    expect(result.map((s) => s.id)).toEqual(['stg-a', 'stg-b', 'stg-z']);
  });

  it('rejects duplicate existing ids', () => {
    expect(() => assignStageIds([withId('x'), withId('x')], counter())).toThrow(DuplicateStageIdError);
  });

  it('rejects a generator that produces an invalid id', () => {
    expect(() => assignStageIds([base], () => 'NOT VALID')).toThrow(/invalid/i);
  });

  it('returns an empty array for an empty process', () => {
    expect(assignStageIds([], counter())).toEqual([]);
  });
});
