import { TEMPLATE_NAME_MAX } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors.js';
import { buildJobTemplate, createInMemoryJobTemplateRepository, createTestJobDeps, userActor } from '../../testing/index.js';
import { createJobTemplate } from './create-job-template.js';
import { deleteJobTemplate } from './delete-job-template.js';
import { listJobTemplates } from './list-job-templates.js';

const actor = userActor({ role: 'recruiter', organizationId: 'org_a' });

describe('createJobTemplate', () => {
  it('stores the template and audits it', async () => {
    const deps = createTestJobDeps();
    const t = await createJobTemplate(deps, actor, { name: 'Eng', content: { title: 'Dev' } });
    expect(t).toMatchObject({ name: 'Eng', organizationId: 'org_a', createdBy: 'user_test' });
    expect(await deps.jobTemplates.findById('org_a', t.id)).toEqual(t);
    expect(deps.auditLog.events()[0]).toMatchObject({
      action: 'job_template.created',
      target: { type: 'job_template', id: t.id },
      metadata: { name: 'Eng' },
    });
  });

  it('validates name and content', async () => {
    const deps = createTestJobDeps();
    for (const input of [
      { name: '', content: { title: 'x' } },
      { name: 'x'.repeat(TEMPLATE_NAME_MAX + 1), content: { title: 'x' } },
      { name: 'ok', content: {} },
    ]) {
      await expect(createJobTemplate(deps, actor, input)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it.each(['hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    await expect(
      createJobTemplate(createTestJobDeps(), userActor({ role, organizationId: 'org_a' }), { name: 'x', content: { title: 'x' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listJobTemplates', () => {
  const deps = () =>
    createTestJobDeps({
      jobTemplates: createInMemoryJobTemplateRepository([
        buildJobTemplate({ id: 't1', organizationId: 'org_a' }),
        buildJobTemplate({ id: 't2', organizationId: 'org_b' }),
      ]),
    });

  it('lists only the organization templates, for hiring managers too', async () => {
    const d = deps();
    const items = await listJobTemplates(d, userActor({ role: 'hiring_manager', organizationId: 'org_a' }), {});
    expect(items.map((t) => t.id)).toEqual(['t1']);
    expect(d.auditLog.events()).toHaveLength(0);
  });

  it('denies interviewers', async () => {
    await expect(listJobTemplates(deps(), userActor({ role: 'interviewer', organizationId: 'org_a' }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('deleteJobTemplate', () => {
  it('deletes and audits', async () => {
    const d = createTestJobDeps({ jobTemplates: createInMemoryJobTemplateRepository([buildJobTemplate({ id: 't1', organizationId: 'org_a' })]) });
    await deleteJobTemplate(d, actor, { templateId: 't1' });
    expect(await d.jobTemplates.findById('org_a', 't1')).toBeNull();
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'job_template.deleted', target: { type: 'job_template', id: 't1' } });
  });

  it('answers not found for missing and foreign templates', async () => {
    const d = createTestJobDeps({ jobTemplates: createInMemoryJobTemplateRepository([buildJobTemplate({ id: 't2', organizationId: 'org_b' })]) });
    await expect(deleteJobTemplate(d, actor, { templateId: 't2' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteJobTemplate(d, actor, { templateId: 'zz' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await d.jobTemplates.findById('org_b', 't2')).not.toBeNull();
  });

  it.each(['hiring_manager', 'interviewer'] as const)('denies %s', async (role) => {
    await expect(deleteJobTemplate(createTestJobDeps(), userActor({ role, organizationId: 'org_a' }), { templateId: 't' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('createJobTemplate stage ids', () => {
  it('assigns an id to every declared stage', async () => {
    const deps = createTestJobDeps();
    const content = { title: 'Dev', process: [{ type: 'hr_interview', durationMinutes: 30, conductedBy: 'recruiter' }] };
    const t = await createJobTemplate(deps, actor, { name: 'Eng', content });
    expect(t.content.process[0]?.id).toMatch(/^stg-[a-z0-9]+$/);
  });
});
