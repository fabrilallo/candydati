import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { createTestJobDeps, userActor } from '../../testing/index.js';
import { suggestResponsibilities, type ResponsibilitySuggester, type SuggestResponsibilitiesDeps } from './suggest-responsibilities.js';

const actor = userActor({ role: 'hiring_manager', organizationId: 'org_a' });
const THREE = ['Progetta le API', 'Rivede il codice', 'Segue il rilascio'];

const build = (answer: unknown | Error, available = true) => {
  const calls: Parameters<ResponsibilitySuggester['suggest']>[0][] = [];
  const errors: unknown[] = [];
  const base = createTestJobDeps();
  const deps: SuggestResponsibilitiesDeps = {
    auditLog: base.auditLog,
    transaction: base.transaction,
    jobTeams: base.jobTeams,
    suggester: {
      available: () => available,
      suggest: async (input) => {
        calls.push(input);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
    onSuggestError: (error) => errors.push(error),
  };
  return { deps, calls, errors, audit: base.auditLog };
};

describe('suggestResponsibilities', () => {
  it('asks the model with the ad context only, validates the answer and audits the call', async () => {
    const { deps, calls, audit } = build({ responsibilities: THREE });
    const result = await suggestResponsibilities(deps, actor, { title: 'Backend dev', role: 'backend_developer', seniority: 'senior', language: 'en', existing: ['Scrive codice'], summary: 'We build APIs.' });
    expect(result).toEqual({ status: 'proposed', responsibilities: THREE });
    expect(calls).toEqual([{ title: 'Backend dev', role: 'backend_developer', seniority: 'senior', language: 'en', existing: ['Scrive codice'], summary: 'We build APIs.' }]);
    expect(audit.events()).toEqual([
      expect.objectContaining({ action: 'job.responsibilities_suggested', target: { type: 'organization', id: 'org_a' }, metadata: { role: 'backend_developer', seniority: 'senior', language: 'en', status: 'proposed', count: 3 } }),
    ]);
  });

  it('drops suggestions that repeat what is already written before they reach the person', async () => {
    const { deps } = build({ responsibilities: ['scrive codice ', ...THREE, 'A', 'B'] });
    const result = await suggestResponsibilities(deps, actor, { title: 'Dev', existing: ['Scrive codice'] });
    expect(result).toEqual({ status: 'proposed', responsibilities: [...THREE, 'A', 'B'] });
  });

  it('answers failed (never throws) when the model fails or answers out of shape, and says why to the hook', async () => {
    const down = build(new Error('timeout'));
    const bad = build({ responsibilities: ['one'] });
    expect(await suggestResponsibilities(down.deps, actor, { title: 'Dev' })).toEqual({ status: 'failed' });
    expect(await suggestResponsibilities(bad.deps, actor, { title: 'Dev' })).toEqual({ status: 'failed' });
    expect(down.errors).toHaveLength(1);
    expect(bad.errors).toHaveLength(1);
  });

  it('answers unavailable without calling anything when no fast model is on', async () => {
    const { deps, calls } = build({ responsibilities: THREE }, false);
    expect(await suggestResponsibilities(deps, actor, { title: 'Dev' })).toEqual({ status: 'unavailable' });
    expect(calls).toEqual([]);
  });

  it('needs job:update and a title or a role, with bounded input', async () => {
    const { deps } = build({ responsibilities: THREE });
    await expect(suggestResponsibilities(deps, userActor({ role: 'interviewer', organizationId: 'org_a' }), { title: 'Dev' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suggestResponsibilities(deps, actor, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(suggestResponsibilities(deps, actor, { title: 'Dev', existing: Array.from({ length: 31 }, () => 'x') })).rejects.toBeInstanceOf(ValidationError);
  });
});
