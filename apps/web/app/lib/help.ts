import { HELP_RECIPES, localizeRecipe, RECIPE_AREAS, recipesFor, searchRecipes, type Locale, type LocalizedRecipe, type RecipeArea, type Role } from '@candydati/domain'

export interface HelpSection {
  readonly area: RecipeArea
  readonly recipes: readonly LocalizedRecipe[]
}

/** The recipes the role may follow, by area in the catalog order; empty areas are left out. Pure. */
export const helpSections = (role: Role | null, locale: Locale): readonly HelpSection[] => {
  const recipes = recipesFor(role, HELP_RECIPES)
  return RECIPE_AREAS.map((area) => ({
    area,
    recipes: recipes.filter((recipe) => recipe.area === area).map((recipe) => localizeRecipe(recipe, locale, {})),
  })).filter((section) => section.recipes.length > 0)
}

/** What the search box finds, best match first. Pure. */
export const helpResults = (role: Role | null, locale: Locale, query: string): readonly LocalizedRecipe[] =>
  searchRecipes(recipesFor(role, HELP_RECIPES), query, locale).map((recipe) => localizeRecipe(recipe, locale, {}))
