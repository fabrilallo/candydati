/**
 * Icons a "values / perks" item may use: a curated set of lucide names (kebab case), so the web app can map each to
 * a component it ships and the page never loads an arbitrary icon.
 */
export const VALUE_ICONS = [
  'heart',
  'sparkles',
  'users',
  'rocket',
  'leaf',
  'globe',
  'coffee',
  'book-open',
  'graduation-cap',
  'laptop',
  'house',
  'clock',
  'calendar',
  'plane',
  'shield-check',
  'hand-heart',
  'lightbulb',
  'target',
  'trophy',
  'smile',
  'bike',
  'baby',
  'piggy-bank',
  'trending-up',
  'handshake',
  'compass',
  'palette',
  'code',
  'zap',
  'sun',
] as const;
export type ValueIcon = (typeof VALUE_ICONS)[number];
