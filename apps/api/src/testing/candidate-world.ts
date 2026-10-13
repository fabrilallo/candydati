import { completeJobContent, fakePdfBytes, validApplicationForm } from '@tt/core/testing';
import type { FastifyInstance } from 'fastify';
import { TestUser } from './client.js';
import { multipartBody, type FieldPart, type FilePart } from './multipart.js';
import { publishNotice } from './privacy.js';
import { uniqueEmail, WEB_ORIGIN, type TestApp } from './test-app.js';

export interface PublishedJob {
  readonly id: string;
  readonly slug: string;
}

export interface World {
  readonly t: TestApp;
  readonly owner: TestUser;
  readonly slug: string;
  readonly job: PublishedJob;
  /** Registers a user of the same organization with `role`. */
  member(role: string): Promise<TestUser>;
  /** Public application as a candidate: multipart with `data` and `cv`. */
  submit(form?: Record<string, unknown>, options?: ApplyOptions): ReturnType<FastifyInstance['inject']>;
}

export interface ApplyOptions {
  readonly job?: PublishedJob;
  readonly cv?: Uint8Array | null;
  readonly extraParts?: readonly (FieldPart | FilePart)[];
  readonly fileName?: string;
  /** Media type of the `data` part, e.g. `application/json` as a browser Blob would send it. */
  readonly dataType?: string;
}

export const personForm = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...validApplicationForm({ email: uniqueEmail('candidate'), firstName: 'Giulia', lastName: 'Bianchi', consentScopes: ['selection'], privacyNoticeVersion: 1 }),
  ...overrides,
});

export async function publishJob(owner: TestUser, title = 'Backend Developer'): Promise<PublishedJob> {
  const created = await owner.post<{ id: string; slug: string }>('/api/v1/jobs', { content: completeJobContent({ title }) });
  const job = created.body.data!;
  const published = await owner.post(`/api/v1/jobs/${job.id}/publish`);
  if (published.status !== 200) throw new Error(`publish failed: ${published.status} ${JSON.stringify(published.body)}`);
  return { id: job.id, slug: job.slug };
}

/** An organization with an owner, a privacy notice (v1) and one published job. */
export async function createWorld(t: TestApp, orgName = 'Acme'): Promise<World> {
  const owner = await new TestUser(t.app, uniqueEmail('owner'), 'Owner').signUp();
  await owner.createOrganization(orgName);
  await publishNotice(owner);
  const job = await publishJob(owner);
  const submit: World['submit'] = (form = personForm(), options = {}) => {
    const target = options.job ?? job;
    const cv = options.cv === undefined ? fakePdfBytes() : options.cv;
    const parts: (FieldPart | FilePart)[] = [{ name: 'data', value: JSON.stringify(form), ...(options.dataType ? { contentType: options.dataType } : {}) }];
    if (cv !== null) parts.push({ name: 'cv', filename: options.fileName ?? 'Giulia Bianchi.pdf', bytes: cv, contentType: 'application/pdf' });
    const { payload, headers } = multipartBody([...parts, ...(options.extraParts ?? [])]);
    return t.app.inject({
      method: 'POST',
      url: `/api/v1/public/organizations/${owner.organizationSlug}/jobs/${target.slug}/applications`,
      headers: { origin: WEB_ORIGIN, ...headers },
      payload,
    });
  };
  const member = async (role: string): Promise<TestUser> => {
    const user = await new TestUser(t.app, uniqueEmail(role), role).signUp();
    return user.joinAs(owner, role);
  };
  return { t, owner, slug: owner.organizationSlug, job, member, submit };
}
