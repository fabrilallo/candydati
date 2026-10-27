import type { UserActor } from '@candydati/core';
import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { toAgentActor } from '../agent-actor.js';
import { buildAgentRequestContext, type PageContext } from '../request-context.js';
import { createFindHelpRecipeTool, HELP_RESULTS_MAX } from './help-tools.js';

const user = (role: UserActor['role']): UserActor => ({ type: 'user', id: 'u1', organizationId: 'o1', onBehalfOfUserId: null, role });
const contextFor = (actor: UserActor, page: PageContext | null = null) => buildAgentRequestContext({ actor: toAgentActor(actor), user: actor }, page);

interface Found {
  readonly recipes: readonly { id: string; title: string; steps: readonly string[]; href: string }[];
}
const tool = createFindHelpRecipeTool() as unknown as { execute: (input: unknown, context: unknown) => Promise<Found> };
const run = (input: unknown, requestContext: unknown) => tool.execute(input, { requestContext });

describe('find_help_recipe', () => {
  it('tells a recruiter where to create a tracked link, in the language asked', async () => {
    const found = await run({ query: 'dove creo un link tracciato', locale: 'it' }, contextFor(user('recruiter')));
    expect(found.recipes[0]).toMatchObject({ id: 'tracked-link', href: '/app/jobs' });
    expect(found.recipes[0]?.steps.join(' ')).toMatch(/Distribuzione/);
    expect(found.recipes.length).toBeLessThanOrEqual(HELP_RESULTS_MAX);
  });

  it('links the tab of the job the person is looking at', async () => {
    const found = await run({ query: 'tracked link', locale: 'en' }, contextFor(user('recruiter'), { route: '/app/jobs/j1', jobId: 'j1' }));
    expect(found.recipes[0]).toMatchObject({ id: 'tracked-link', href: '/app/jobs/j1/distribution' });
  });

  it('answers from the person role, not the narrower agent scopes, and hides what the role cannot do', async () => {
    expect((await run({ query: 'api key', locale: 'en' }, contextFor(user('owner')))).recipes.map((r) => r.id)).toContain('api-key');
    expect((await run({ query: 'api key', locale: 'en' }, contextFor(user('interviewer')))).recipes.map((r) => r.id)).not.toContain('api-key');
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await run({ query: 'zzzz qqqq', locale: 'it' }, contextFor(user('owner')))).toEqual({ recipes: [] });
  });

  it('refuses to run outside a signed-in chat', async () => {
    await expect(run({ query: 'link', locale: 'it' }, new RequestContext())).rejects.toThrow(/agent identity/);
  });
});
