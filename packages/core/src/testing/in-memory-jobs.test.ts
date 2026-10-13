import { describe, expect, it } from 'vitest';
import { ConflictError } from '../errors.js';
import { buildJob, buildJobTemplate } from './job-fixtures.js';
import {
  createInMemoryJobRepository,
  createInMemoryJobTemplateRepository,
  createInMemoryOrganizationDirectory,
} from './in-memory-jobs.js';

describe('in-memory job repositories', () => {
  it('rejects duplicate slugs per organization only and scopes reads', async () => {
    const repo = createInMemoryJobRepository();
    await repo.create(buildJob({ id: '1', organizationId: 'a' }));
    await expect(repo.create(buildJob({ id: '2', organizationId: 'a' }))).rejects.toBeInstanceOf(ConflictError);
    await repo.create(buildJob({ id: '3', organizationId: 'b' }));
    expect(await repo.findById('b', '1')).toBeNull();
    expect(repo.snapshot()).toHaveLength(2);
  });

  it('writes only inside the organization and only from the expected status', async () => {
    const repo = createInMemoryJobRepository([buildJob({ id: '1', organizationId: 'a' })]);
    await expect(repo.transition('b', '1', 'draft', { status: 'closed', closedAt: new Date(), updatedAt: new Date() })).rejects.toThrow();
    await expect(repo.updateContent('a', '1', 'published', { content: buildJob().content, updatedAt: new Date() })).rejects.toThrow();
    expect(await repo.lock('a', '1', 'update')).toMatchObject({ status: 'draft' });
    expect((await repo.findById('a', '1'))?.status).toBe('draft');
  });

  it('templates and directory', async () => {
    const templates = createInMemoryJobTemplateRepository();
    await templates.create(buildJobTemplate({ id: 't', organizationId: 'a' }));
    expect(await templates.delete('b', 't')).toBe(false);
    expect(await templates.delete('a', 't')).toBe(true);
    const dir = createInMemoryOrganizationDirectory([{ id: '1', name: 'n', slug: 's', logo: null }]);
    expect(await dir.findBySlug('s')).not.toBeNull();
    expect(await dir.findBySlug('x')).toBeNull();
  });
});
