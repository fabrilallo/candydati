import { createTool } from '@mastra/core/tools';
import { HELP_RECIPES, localizeRecipe, recipesFor, searchRecipes, SUPPORTED_LOCALES } from '@candydati/domain';
import { z } from 'zod';
import { readAgentIdentity, readPageContext } from '../request-context.js';

export const HELP_RESULTS_MAX = 3;

/**
 * Where and how something is done in the interface, from the help catalog. It reads static texts only, so it needs no
 * agent scope: it filters on the person's role, because the person is the one who will follow the steps.
 */
export const createFindHelpRecipeTool = () =>
  createTool({
    id: 'find_help_recipe',
    description:
      'Finds the step-by-step instructions to do something in the app (where a page or a button is, how a feature works): for example creating a tracked link, inviting a member, setting up automations. ' +
      'Pass the user question as query and the language of the answer. Returns up to three recipes with steps and an in-app link; only what the user role can do.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(200), locale: z.enum(SUPPORTED_LOCALES) }),
    execute: async (input, context) => {
      const { user } = readAgentIdentity(context?.requestContext);
      const page = readPageContext(context?.requestContext);
      const found = searchRecipes(recipesFor(user.role, HELP_RECIPES), input.query, input.locale).slice(0, HELP_RESULTS_MAX);
      return { recipes: found.map((recipe) => localizeRecipe(recipe, input.locale, { jobId: page?.jobId ?? null })) };
    },
  });
