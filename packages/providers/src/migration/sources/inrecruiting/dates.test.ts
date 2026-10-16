import { describe, expect, it } from 'vitest';
import { parseSheetDate } from './dates.js';

describe('parseSheetDate', () => {
  it.each([
    ['2025-03-14', '2025-03-14T00:00:00.000Z'],
    ['2025-03-14T10:30:00Z', '2025-03-14T10:30:00.000Z'],
    ['14/03/2025', '2025-03-14T00:00:00.000Z'],
    ['14-03-2025 09:15', '2025-03-14T09:15:00.000Z'],
    ['1.2.2025', '2025-02-01T00:00:00.000Z'],
    ['03/04/2025', '2025-04-03T00:00:00.000Z'],
    ['03/14/2025', '2025-03-14T00:00:00.000Z'],
  ])('reads %s', (text, iso) => expect(parseSheetDate(text)).toBe(iso));

  it.each(['', 'ieri', '31/02/2025', '2025-13-01', '14/03/25', '2025-03-14T25:00'])('refuses %j', (text) => expect(parseSheetDate(text)).toBeNull());
});
