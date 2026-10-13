export type ImportRow = Readonly<Record<string, string>>;

export interface ParsedTable {
  readonly headers: readonly string[];
  readonly rows: readonly ImportRow[];
  /** True when the input had more rows than the cap. */
  readonly truncated: boolean;
}

/** Empty headers become `column_N`, duplicates get a ` (2)` suffix, so every column has a unique key. */
export function uniqueHeaders(raw: readonly string[]): readonly string[] {
  const seen = new Map<string, number>();
  return raw.map((value, index) => {
    const base = value.trim() === '' ? `column_${index + 1}` : value.trim();
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

export function toRow(headers: readonly string[], cells: readonly string[]): ImportRow {
  return Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()]));
}

export const isBlankRow = (cells: readonly string[]): boolean => cells.every((cell) => cell.trim() === '');
