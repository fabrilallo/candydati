import type { Recipe } from './recipe.js';
import { CANDIDATE_RECIPES } from './recipes-candidates.js';
import { DATA_RECIPES } from './recipes-data.js';
import { JOB_RECIPES } from './recipes-jobs.js';
import { ORGANIZATION_RECIPES } from './recipes-organization.js';

/**
 * Every help recipe, in the order the help page shows them. When a screen changes its labels or moves a feature, the
 * recipe that quotes it changes in the same commit.
 */
export const HELP_RECIPES: readonly Recipe[] = [...JOB_RECIPES, ...CANDIDATE_RECIPES, ...ORGANIZATION_RECIPES, ...DATA_RECIPES];
