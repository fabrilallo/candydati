const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function build(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const exact = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60;
  return exact ? date.toISOString() : null;
}

const num = (value: string | undefined): number | undefined => (value === undefined ? undefined : Number(value));

/**
 * A date as a spreadsheet writes it, to an ISO instant (UTC), or null. `2025-03-14`, `2025-03-14T10:30:00Z`, `14/03/2025`
 * (Italian order, also `-` and `.`), with an optional time. `03/14/2025` is read as month first only when the day cannot
 * be a month; `03/04/2025` is 3 April.
 */
export function parseSheetDate(value: string): string | null {
  const text = value.trim();
  const iso = ISO.exec(text);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]), num(iso[4]), num(iso[5]), num(iso[6]));
  const dmy = DMY.exec(text);
  if (!dmy) return null;
  const [first, second] = [Number(dmy[1]), Number(dmy[2])];
  const [day, month] = second > 12 && first <= 12 ? [second, first] : [first, second];
  return build(Number(dmy[3]), month, day, num(dmy[4]), num(dmy[5]), num(dmy[6]));
}
