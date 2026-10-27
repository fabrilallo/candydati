import { describe, expect, it } from 'vitest';
import { ROLES } from '../access/permissions.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { HELP_RECIPES } from './catalog.js';
import { localizeRecipe, recipeHref, recipeSchema, recipesFor, searchRecipes, type Recipe } from './recipe.js';

const recipe = (overrides: Partial<Recipe>): Recipe => ({
  id: 'sample',
  area: 'jobs',
  permission: null,
  route: '/app/jobs',
  title: { it: 'Titolo', en: 'Title' },
  steps: { it: ['Passo'], en: ['Step'] },
  keywords: { it: [], en: [] },
  ...overrides,
});

describe('help catalog', () => {
  it('has valid recipes with unique ids, both languages and the same number of steps in each', () => {
    expect(HELP_RECIPES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(HELP_RECIPES.map((entry) => entry.id)).size).toBe(HELP_RECIPES.length);
    for (const entry of HELP_RECIPES) {
      expect(recipeSchema.safeParse(entry).success, entry.id).toBe(true);
      expect(entry.steps.it.length, entry.id).toBe(entry.steps.en.length);
    }
  });

  it('never names the product: a deployment can rebrand', () => {
    expect(JSON.stringify(HELP_RECIPES).toLowerCase()).not.toContain('candydati');
  });

  it('leaves every role at least one recipe', () => {
    for (const role of ROLES) expect(recipesFor(role, HELP_RECIPES).length, role).toBeGreaterThan(0);
  });
});

describe('recipesFor', () => {
  it('keeps only what the role may do', () => {
    const ids = recipesFor('interviewer', HELP_RECIPES).map((entry) => entry.id);
    expect(ids).not.toContain('tracked-link');
    expect(ids).not.toContain('api-key');
    expect(recipesFor('owner', HELP_RECIPES)).toHaveLength(HELP_RECIPES.length);
  });

  it('shows nothing to someone without a role', () => {
    expect(recipesFor(null, HELP_RECIPES)).toEqual([]);
  });
});

describe('searchRecipes', () => {
  it('finds the tracked link in Italian, whatever the inflection and the accents', () => {
    for (const query of ['dove creo un link tracciato?', 'Link tracciati', 'utm']) {
      expect(searchRecipes(HELP_RECIPES, query, 'it')[0]?.id, query).toBe('tracked-link');
    }
  });

  it('finds the tracked link in English', () => {
    expect(searchRecipes(HELP_RECIPES, 'How do I create a tracked link?', 'en')[0]?.id).toBe('tracked-link');
  });

  it('puts title matches before step matches, then keeps the catalog order', () => {
    const catalog = [
      recipe({ id: 'steps', steps: { it: ['Apri la pagina carriera'], en: ['Open'] } }),
      recipe({ id: 'title', title: { it: 'Pagina carriera', en: 'Careers' } }),
      recipe({ id: 'other', title: { it: 'Altro', en: 'Other' } }),
    ];
    expect(searchRecipes(catalog, 'carriera', 'it').map((entry) => entry.id)).toEqual(['title', 'steps']);
  });

  it('returns nothing for an empty or stopword-only query', () => {
    expect(searchRecipes(HELP_RECIPES, '   ', 'it')).toEqual([]);
    expect(searchRecipes(HELP_RECIPES, 'come dove', 'it')).toEqual([]);
  });

  it('does not change the catalog it searches', () => {
    const catalog = [recipe({ id: 'a' }), recipe({ id: 'b' })];
    const copy = structuredClone(catalog);
    searchRecipes(catalog, 'titolo', 'it');
    expect(catalog).toEqual(copy);
  });
});

describe('recipeHref', () => {
  it('opens the tab of the job in sight when there is one', () => {
    const entry = recipe({ route: '/app/jobs', jobTab: 'distribution' });
    expect(recipeHref(entry, { jobId: 'job 1' })).toBe('/app/jobs/job%201/distribution');
    expect(recipeHref(recipe({ jobTab: '' }), { jobId: 'j1' })).toBe('/app/jobs/j1');
  });

  it('falls back to the page that lists the jobs', () => {
    expect(recipeHref(recipe({ route: '/app/jobs', jobTab: 'distribution' }), {})).toBe('/app/jobs');
    expect(recipeHref(recipe({ route: '/app/settings/api' }), { jobId: 'j1' })).toBe('/app/settings/api');
  });
});

describe('localizeRecipe', () => {
  it('returns the texts of one language and the link', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const view = localizeRecipe(recipe({ route: '/app/jobs' }), locale, {});
      expect(view).toEqual({
        id: 'sample',
        area: 'jobs',
        title: locale === 'it' ? 'Titolo' : 'Title',
        steps: locale === 'it' ? ['Passo'] : ['Step'],
        href: '/app/jobs',
      });
    }
  });
});
