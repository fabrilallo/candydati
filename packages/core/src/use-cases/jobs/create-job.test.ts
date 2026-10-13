import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import {
  buildJobTemplate,
  completeJobContent,
  createInMemoryJobTemplateRepository,
  createTestJobDeps,
  userActor,
} from '../../testing/index.js';
import { createJob } from './create-job.js';

const actor = userActor({ role: 'recruiter', organizationId: 'org_a' });

describe('createJob', () => {
  it('creates a draft with only a title, slug from title and id, and audits it', async () => {
    const deps = createTestJobDeps();
    const job = await createJob(deps, actor, { content: { title: 'Backend Developer (Milano)' } });
    expect(job).toMatchObject({
      status: 'draft',
      organizationId: 'org_a',
      slug: 'backend-developer-milano-000001',
      createdBy: 'user_test',
      quality: null,
      publishedAt: null,
      closedAt: null,
    });
    expect(job.createdAt).toEqual(deps.now());
    expect(await deps.jobs.findById('org_a', job.id)).toEqual(job);
    const [event] = deps.auditLog.events();
    expect(event).toMatchObject({
      action: 'job.created',
      organizationId: 'org_a',
      target: { type: 'job', id: job.id },
      metadata: { title: 'Backend Developer (Milano)' },
    });
  });

  it('rejects content without a title', async () => {
    await expect(createJob(createTestJobDeps(), actor, { content: {} })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a non-object content', async () => {
    await expect(createJob(createTestJobDeps(), actor, { content: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('prefixes validation paths with content', async () => {
    const error = await createJob(createTestJobDeps(), actor, { content: { title: '' } }).catch((e: unknown) => e);
    expect((error as ValidationError).issues[0]?.path).toBe('content.title');
  });

  it('merges field by field over the template content', async () => {
    const template = buildJobTemplate({ organizationId: 'org_a', content: completeJobContent({ title: 'Template', summary: 'From template' }) });
    const deps = createTestJobDeps({ jobTemplates: createInMemoryJobTemplateRepository([template]) });
    const job = await createJob(deps, actor, { templateId: template.id, content: { title: 'Mine', seniority: 'senior' } });
    expect(job.content.title).toBe('Mine');
    expect(job.content.seniority).toBe('senior');
    expect(job.content.summary).toBe('From template');
    expect(job.content.salary.min).toBe(35000);
  });

  it('keeps the template title when none is given', async () => {
    const template = buildJobTemplate({ organizationId: 'org_a' });
    const deps = createTestJobDeps({ jobTemplates: createInMemoryJobTemplateRepository([template]) });
    const job = await createJob(deps, actor, { templateId: template.id, content: {} });
    expect(job.content.title).toBe(template.content.title);
  });

  it('does not find a template of another organization', async () => {
    const template = buildJobTemplate({ organizationId: 'org_b' });
    const deps = createTestJobDeps({ jobTemplates: createInMemoryJobTemplateRepository([template]) });
    await expect(createJob(deps, actor, { templateId: template.id, content: { title: 'x' } })).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.auditLog.events()).toHaveLength(0);
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['recruiter', true],
    ['hiring_manager', true],
    ['interviewer', false],
  ] as const)('permission for %s: %s', async (role, allowed) => {
    const run = createJob(createTestJobDeps(), userActor({ role, organizationId: 'org_a' }), { content: { title: 'x' } });
    if (allowed) await expect(run).resolves.toBeDefined();
    else await expect(run).rejects.toBeInstanceOf(ForbiddenError);
  });
});
