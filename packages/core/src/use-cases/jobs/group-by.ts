/** Groups items by key, keeping first-seen key order and input order inside each group. Inputs are not modified. */
export function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
