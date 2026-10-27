import { z } from 'zod';
import { isPermission, roleHasPermission, type Permission, type Role } from '../access/permissions.js';
import type { Locale } from '../platform/config.js';

/**
 * Help recipes: "how do I…" answers for the people who use the app, written once and read by the help page and by the
 * assistant. Static data and pure functions: a recipe says where something is done, it never does it.
 */
export const RECIPE_AREAS = ['jobs', 'candidates', 'team', 'setup', 'integrations', 'privacy'] as const;
export type RecipeArea = (typeof RECIPE_AREAS)[number];

/** The pages of a job (`/app/jobs/:id/<tab>`); `''` is the ad itself. */
export const JOB_TABS = ['', 'candidates', 'team', 'automations', 'distribution'] as const;
export type JobTab = (typeof JOB_TABS)[number];

export type Localized<T> = Readonly<Record<Locale, T>>;

export interface Recipe {
  readonly id: string;
  readonly area: RecipeArea;
  /** What the person needs to do it; null when every member can. */
  readonly permission: Permission | null;
  /** The page where it starts, with no ids in it. */
  readonly route: string;
  /** When it happens inside a job: the tab to open if a job is in sight. */
  readonly jobTab?: JobTab;
  readonly title: Localized<string>;
  readonly steps: Localized<readonly string[]>;
  /** Words people search with that are not in the title: synonyms, jargon, the other names of the thing. */
  readonly keywords: Localized<readonly string[]>;
}

const text = z.string().trim().min(2).max(300);
const localized = <T extends z.ZodType>(schema: T) => z.object({ it: schema, en: schema });

export const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  area: z.enum(RECIPE_AREAS),
  permission: z.string().refine(isPermission).nullable(),
  route: z.string().regex(/^\/app(?:\/[a-z0-9-]+)*$/),
  jobTab: z.enum(JOB_TABS).optional(),
  title: localized(text.max(80)),
  steps: localized(z.array(text).min(1).max(8)),
  keywords: localized(z.array(text.max(40)).max(12)),
});

export const recipesFor = (role: Role | null, recipes: readonly Recipe[]): readonly Recipe[] =>
  role === null ? [] : recipes.filter((recipe) => recipe.permission === null || roleHasPermission(role, recipe.permission));

const STOPWORDS: ReadonlySet<string> = new Set([
  // it
  'come', 'dove', 'cosa', 'faccio', 'fare', 'posso', 'devo', 'voglio', 'creo', 'una', 'uno', 'del', 'della', 'dei', 'delle',
  'per', 'con', 'che', 'nel', 'nella', 'sul', 'sulla', 'mio', 'mia', 'miei', 'gli', 'questo', 'questa',
  // en
  'how', 'where', 'what', 'can', 'the', 'and', 'for', 'with', 'my', 'into', 'from', 'this', 'that', 'want', 'need', 'does',
]);

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lowercase words without accents, minus the filler of a question; long words lose their ending (tracciati ~ tracciato). */
const queryStems = (query: string): readonly string[] =>
  normalize(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map((word) => (word.length > 5 ? word.slice(0, -2) : word));

const WEIGHTS = { title: 3, keywords: 2, steps: 1 } as const;

const scoreOf = (recipe: Recipe, stems: readonly string[], locale: Locale): number => {
  const fields = {
    title: normalize(recipe.title[locale]),
    keywords: normalize(recipe.keywords[locale].join(' ')),
    steps: normalize(recipe.steps[locale].join(' ')),
  };
  return stems.reduce((total, stem) => {
    const field = (['title', 'keywords', 'steps'] as const).find((key) => fields[key].includes(stem));
    return total + (field ? WEIGHTS[field] : 0);
  }, 0);
};

/** The recipes that match the words of the query, best match first, catalog order on a tie. */
export function searchRecipes(recipes: readonly Recipe[], query: string, locale: Locale): readonly Recipe[] {
  const stems = queryStems(query);
  if (stems.length === 0) return [];
  return recipes
    .map((recipe, index) => ({ recipe, index, score: scoreOf(recipe, stems, locale) }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.recipe);
}

export interface RecipeLinkContext {
  readonly jobId?: string | null;
}

export const recipeHref = (recipe: Recipe, context: RecipeLinkContext): string => {
  if (recipe.jobTab === undefined || !context.jobId) return recipe.route;
  const job = `/app/jobs/${encodeURIComponent(context.jobId)}`;
  return recipe.jobTab === '' ? job : `${job}/${recipe.jobTab}`;
};

export interface LocalizedRecipe {
  readonly id: string;
  readonly area: RecipeArea;
  readonly title: string;
  readonly steps: readonly string[];
  readonly href: string;
}

export const localizeRecipe = (recipe: Recipe, locale: Locale, context: RecipeLinkContext): LocalizedRecipe => ({
  id: recipe.id,
  area: recipe.area,
  title: recipe.title[locale],
  steps: recipe.steps[locale],
  href: recipeHref(recipe, context),
});
