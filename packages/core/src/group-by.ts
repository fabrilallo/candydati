/** `items` grouped by `keyOf`, keeping the order of first appearance. Returns new arrays; the input is untouched. */
export const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
};
