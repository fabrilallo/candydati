import { ORGANIZATION_SKILL_ALIASES_MAX } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError, type ConflictError } from '../../errors.js';
import { toSkillAliasOverviewDto } from '../../mappers/skill-alias-dto.js';
import { agentActor, apiKeyActor, createTestCandidateDeps, ORG_A, ORG_B, userActor } from '../../testing/index.js';
import { addSkillAlias, disableBuiltInSkillAlias, enableBuiltInSkillAlias, listSkillAliases, loadSkillBook, removeSkillAlias } from './skill-aliases.js';

const admin = userActor({ role: 'admin', organizationId: ORG_A });
const otherAdmin = userActor({ role: 'admin', organizationId: ORG_B });
const code = async (promise: Promise<unknown>): Promise<string | undefined> => ((await promise.catch((e: unknown) => e)) as ConflictError).message;

describe('adding an alias', () => {
  it('attaches it to a built-in skill, under any of its names, and audits it', async () => {
    const deps = createTestCandidateDeps();
    const added = await addSkillAlias(deps, admin, { skill: 'golang', alias: 'Go Developer' });
    expect(added).toMatchObject({ organizationId: ORG_A, skill: 'Go', alias: 'Go Developer', aliasKey: 'godeveloper', createdBy: 'user_test' });
    expect((await loadSkillBook(deps, ORG_A)).keys('Go')).toContain('godeveloper');
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'skill_alias.added', target: { type: 'skill_alias', id: added.id }, metadata: { skill: 'Go', alias: 'Go Developer' } });
  });

  it('creates a new skill of the organization, and keeps it out of the other organizations', async () => {
    const deps = createTestCandidateDeps();
    await addSkillAlias(deps, admin, { skill: 'Zorgbase', alias: 'Zorgy' });
    expect((await loadSkillBook(deps, ORG_A)).keys('zorgy')).toEqual(expect.arrayContaining(['zorgbase', 'zorgy']));
    expect((await loadSkillBook(deps, ORG_B)).keys('zorgy')).toEqual(['zorgy']);
  });

  it('keeps one skill per alias: another skill, the same skill or the same alias twice is a conflict', async () => {
    const deps = createTestCandidateDeps();
    await addSkillAlias(deps, admin, { skill: 'Zorgbase', alias: 'Zorgy' });
    expect(await code(addSkillAlias(deps, admin, { skill: 'Python', alias: 'golang' }))).toBe('alias_taken');
    expect(await code(addSkillAlias(deps, admin, { skill: 'Sketch', alias: 'ZORGY' }))).toBe('alias_taken');
    expect(await code(addSkillAlias(deps, admin, { skill: 'Zorgbase', alias: 'zorgy' }))).toBe('alias_redundant');
    expect(await code(addSkillAlias(deps, admin, { skill: 'Go', alias: 'GoLang' }))).toBe('alias_redundant');
    // The same written form in another organization is its own matter.
    await expect(addSkillAlias(deps, otherAdmin, { skill: 'Sketch', alias: 'Zorgy' })).resolves.toMatchObject({ skill: 'Sketch' });
  });

  it('validates the text: no empty, symbol-only, overlong or protected-characteristic words', async () => {
    const deps = createTestCandidateDeps();
    for (const alias of ['', '  ', '!!', 'x'.repeat(61), 'giovane']) {
      await expect(addSkillAlias(deps, admin, { skill: 'Go', alias })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(addSkillAlias(deps, admin, { skill: 'Go' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('stops at the limit of aliases per organization', async () => {
    const deps = createTestCandidateDeps();
    for (let index = 0; index < ORGANIZATION_SKILL_ALIASES_MAX; index += 1) {
      await deps.skillAliases.add({ id: `a${index}`, organizationId: ORG_A, skill: 'Zorgbase', alias: `alias ${index}`, aliasKey: `alias${index}`, createdBy: 'u', createdAt: new Date() });
    }
    expect(await code(addSkillAlias(deps, admin, { skill: 'Zorgbase', alias: 'one more' }))).toBe('alias_limit');
    await expect(addSkillAlias(deps, otherAdmin, { skill: 'Zorgbase', alias: 'one more' })).resolves.toBeDefined();
  });
});

describe('removing an alias', () => {
  it('removes it, audits it, and finds nothing in another organization', async () => {
    const deps = createTestCandidateDeps();
    const added = await addSkillAlias(deps, admin, { skill: 'Go', alias: 'Gopher' });
    await expect(removeSkillAlias(deps, otherAdmin, { aliasId: added.id })).rejects.toBeInstanceOf(NotFoundError);
    await removeSkillAlias(deps, admin, { aliasId: added.id });
    expect((await loadSkillBook(deps, ORG_A)).keys('Go')).not.toContain('gopher');
    expect(deps.auditLog.events().map((event) => event.action)).toEqual(['skill_alias.added', 'skill_alias.removed']);
    await expect(removeSkillAlias(deps, admin, { aliasId: added.id })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('switching a built-in alias', () => {
  it('turns it off and on, audits only a real change, and leaves the other organizations alone', async () => {
    const deps = createTestCandidateDeps();
    expect(await disableBuiltInSkillAlias(deps, admin, { alias: 'Golang' })).toMatchObject({ aliasKey: 'golang', changed: true });
    expect(await disableBuiltInSkillAlias(deps, admin, { alias: 'GOLANG' })).toMatchObject({ changed: false });
    expect((await loadSkillBook(deps, ORG_A)).keys('Go')).toEqual(['go']);
    expect((await loadSkillBook(deps, ORG_B)).keys('Go')).toContain('golang');
    expect(await enableBuiltInSkillAlias(deps, admin, { alias: 'golang' })).toMatchObject({ changed: true });
    expect(await enableBuiltInSkillAlias(deps, admin, { alias: 'golang' })).toMatchObject({ changed: false });
    expect((await loadSkillBook(deps, ORG_A)).keys('Go')).toContain('golang');
    expect(deps.auditLog.events().map((event) => event.action)).toEqual(['skill_alias.disabled', 'skill_alias.enabled']);
  });

  it('knows only built-in aliases: a skill name or an unknown word is not found', async () => {
    const deps = createTestCandidateDeps();
    for (const alias of ['Go', 'whatever']) await expect(disableBuiltInSkillAlias(deps, admin, { alias })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets a disabled alias be given to another skill', async () => {
    const deps = createTestCandidateDeps();
    await disableBuiltInSkillAlias(deps, admin, { alias: 'golang' });
    await addSkillAlias(deps, admin, { skill: 'Python', alias: 'golang' });
    expect((await loadSkillBook(deps, ORG_A)).keys('Python')).toContain('golang');
  });
});

describe('who may manage skill aliases', () => {
  it('lets owners and admins, and nobody else, not even an agent or a key', async () => {
    const deps = createTestCandidateDeps();
    await expect(listSkillAliases(deps, userActor({ role: 'owner', organizationId: ORG_A }), {})).resolves.toBeDefined();
    await expect(listSkillAliases(deps, admin, {})).resolves.toBeDefined();
    for (const actor of [userActor({ role: 'recruiter', organizationId: ORG_A }), userActor({ role: 'hiring_manager', organizationId: ORG_A }), agentActor({ organizationId: ORG_A }), apiKeyActor({ organizationId: ORG_A })]) {
      await expect(addSkillAlias(deps, actor, { skill: 'Go', alias: 'Gopher' })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listSkillAliases(deps, actor, {})).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(deps.auditLog.events()).toEqual([]);
  });
});

describe('the overview', () => {
  it('lists the built-in aliases with their state, and the organization ones, in the DTO', async () => {
    const deps = createTestCandidateDeps();
    await addSkillAlias(deps, admin, { skill: 'Go', alias: 'Gopher' });
    await disableBuiltInSkillAlias(deps, admin, { alias: 'golang' });
    const dto = toSkillAliasOverviewDto(await listSkillAliases(deps, admin, {}));
    expect(dto.builtIn.find((entry) => entry.id === 'go')).toEqual({ id: 'go', name: 'Go', aliases: [{ alias: 'golang', enabled: false }] });
    expect(dto.own).toMatchObject([{ skill: 'Go', alias: 'Gopher', createdAt: '2026-06-01T10:00:00.000Z' }]);
    expect(dto.limit).toBe(ORGANIZATION_SKILL_ALIASES_MAX);
  });
});
