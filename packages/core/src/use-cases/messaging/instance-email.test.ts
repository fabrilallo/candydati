import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { ORG_A, userActor } from '../../testing/index.js';
import { createInstanceEmailWorld } from '../../testing/instance-email-deps.js';
import { getInstanceEmailSettings, updateInstanceEmailSettings } from './instance-email.js';

const OWNER = userActor({ id: 'owner', role: 'owner', organizationId: ORG_A });
const SMTP = { provider: 'smtp', smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', password: 'smtp-pass' }, sendingDomain: 'mail.example.com', fromLocal: 'jobs' } as const;
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('getInstanceEmailSettings', () => {
  it('says nothing is configured, and who may configure it', async () => {
    const world = createInstanceEmailWorld();
    expect(await getInstanceEmailSettings(world, OWNER, {})).toEqual({
      source: 'none', ready: false, canManage: true, provider: null, smtp: null, resend: null, sendingDomain: null, fromLocal: 'noreply', verifiedAt: null,
    });
    const recruiter = userActor({ id: 'r', role: 'recruiter', organizationId: ORG_A });
    expect((await getInstanceEmailSettings(world, recruiter, {})).canManage).toBe(false);
  });

  it('is read-only when the environment sets the provider', async () => {
    const world = createInstanceEmailWorld({ source: 'environment' });
    expect(await getInstanceEmailSettings(world, OWNER, {})).toMatchObject({ source: 'environment', ready: true, canManage: false });
  });
});

describe('updateInstanceEmailSettings', () => {
  it('sends a test email to the admin, then seals the secret, saves, applies at once and audits', async () => {
    const world = createInstanceEmailWorld();
    const view = await updateInstanceEmailSettings(world, OWNER, SMTP);
    expect(world.tests()).toEqual([
      { transport: { kind: 'smtp', host: 'smtp.example.com', port: 587, secure: false, user: 'apikey', password: 'smtp-pass' }, email: expect.objectContaining({ from: '"Platform" <jobs@mail.example.com>', to: 'owner@example.com' }) },
    ]);
    const stored = world.stored();
    expect(stored).toMatchObject({ provider: 'smtp', smtpHost: 'smtp.example.com', sendingDomain: 'mail.example.com', fromLocal: 'jobs', updatedBy: 'owner' });
    expect(stored?.secretCiphertext).not.toContain('smtp-pass');
    expect(world.refreshes()).toBe(1);
    expect(view).toMatchObject({ source: 'app', ready: true, provider: 'smtp', smtp: { host: 'smtp.example.com', hasPassword: true }, sendingDomain: 'mail.example.com' });
    expect(JSON.stringify(view)).not.toContain('smtp-pass');
    expect(world.auditLog.events()[0]).toMatchObject({ action: 'email_settings.updated', target: { type: 'instance_email_settings', id: 'instance' }, metadata: { provider: 'smtp', sendingDomain: 'mail.example.com' } });
  });

  it('saves nothing when the provider refuses the test, and says why', async () => {
    const world = createInstanceEmailWorld({ testFails: 'domain is not verified' });
    const error = await rejection(updateInstanceEmailSettings(world, OWNER, { provider: 'resend', resend: { apiKey: 're_x' }, sendingDomain: 'example.com', fromLocal: 'noreply' }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'test', message: 'email_test_failed' }, { path: 'test.detail', message: 'domain is not verified' }]);
    expect(world.stored()).toBeNull();
    expect(world.auditLog.events()).toEqual([]);
  });

  it('keeps the stored secret when the form leaves it empty, and needs one for a new Resend setup', async () => {
    const world = createInstanceEmailWorld();
    await updateInstanceEmailSettings(world, OWNER, SMTP);
    await updateInstanceEmailSettings(world, OWNER, { ...SMTP, smtp: { ...SMTP.smtp, password: undefined }, fromLocal: 'hr' });
    expect(world.tests()[1]?.transport).toMatchObject({ password: 'smtp-pass' });
    expect(world.stored()?.fromLocal).toBe('hr');
    const missing = await rejection(updateInstanceEmailSettings(world, OWNER, { provider: 'resend', resend: {}, sendingDomain: 'example.com', fromLocal: 'noreply' }));
    expect((missing as ValidationError).issues).toEqual([{ path: 'resend.apiKey', message: 'required' }]);
  });

  it('is refused to anyone but the first owner or an instance admin, and when the environment decides', async () => {
    const world = createInstanceEmailWorld();
    const otherOwner = userActor({ id: 'someone', role: 'owner', organizationId: ORG_A });
    expect(await rejection(updateInstanceEmailSettings(world, otherOwner, SMTP))).toBeInstanceOf(ForbiddenError);
    const recruiter = userActor({ id: 'owner', role: 'recruiter', organizationId: ORG_A });
    expect(await rejection(updateInstanceEmailSettings(world, recruiter, SMTP))).toBeInstanceOf(ForbiddenError);
    const fromEnv = createInstanceEmailWorld({ source: 'environment' });
    expect(await rejection(updateInstanceEmailSettings(fromEnv, OWNER, SMTP))).toBeInstanceOf(ConflictError);
    expect(world.tests()).toEqual([]);
  });
});
