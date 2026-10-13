import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { buildEmailSettings, createFakeEmailIdentity, seedMessagingWorld, userActor, ORG_A } from '../../testing/index.js';
import { getEmailSettings, updateEmailSettings, verifyEmailDomain } from './email-settings.js';

const admin = userActor({ role: 'admin', organizationId: ORG_A });
const rejection = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);
const records = [{ type: 'TXT', name: '_dmarc.acme.com', value: 'v=DMARC1' }];

describe('getEmailSettings', () => {
  it('shows the default identity when nothing is set', async () => {
    const view = await getEmailSettings(seedMessagingWorld(), userActor({ role: 'interviewer', organizationId: ORG_A }), {});
    expect(view).toEqual({ senderName: 'Acme', fromAddress: null, domain: null, effectiveFrom: '"Acme via Platform" <jobs@mail.platform.example>' });
  });

  it('uses the sender name with the platform identity while the domain is not verified, and the own address once verified', async () => {
    const pending = seedMessagingWorld({ messaging: { settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'pending', domainRecords: records })] } });
    const a = await getEmailSettings(pending, admin, {});
    expect(a.effectiveFrom).toBe('"Acme Careers via Platform" <jobs@mail.platform.example>');
    expect(a.domain).toEqual({ name: 'acme.com', status: 'pending', records });
    const verified = seedMessagingWorld({ messaging: { settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'verified' })] } });
    expect((await getEmailSettings(verified, admin, {})).effectiveFrom).toBe('"Acme Careers" <hr@acme.com>');
  });
});

describe('updateEmailSettings', () => {
  it('stores the settings and checks a new domain with the provider', async () => {
    const identity = createFakeEmailIdentity({ status: 'pending', records });
    const deps = seedMessagingWorld({ messagingOverrides: { identity } });
    const view = await updateEmailSettings(deps, admin, { senderName: 'Acme HR', fromAddress: 'HR@Acme.com' });
    expect(identity.calls()).toEqual(['acme.com']);
    expect(view).toMatchObject({ senderName: 'Acme HR', fromAddress: 'hr@acme.com', domain: { name: 'acme.com', status: 'pending', records } });
    expect(deps.messagingStore.read().settings[0]).toMatchObject({ organizationId: ORG_A, domain: 'acme.com' });
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'email_settings.updated', target: { type: 'email_settings', id: ORG_A }, metadata: { domainStatus: 'pending' } });
  });

  it('keeps the known status for the same domain and clears everything with a null address', async () => {
    const identity = createFakeEmailIdentity();
    const deps = seedMessagingWorld({
      messaging: { settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'verified', domainRecords: records })] },
      messagingOverrides: { identity },
    });
    const same = await updateEmailSettings(deps, admin, { senderName: 'X', fromAddress: 'jobs@acme.com' });
    expect(same.domain?.status).toBe('verified');
    expect(identity.calls()).toEqual([]);
    const cleared = await updateEmailSettings(deps, admin, { senderName: 'X', fromAddress: null });
    expect(cleared.domain).toBeNull();
    expect(deps.messagingStore.read().settings[0]).toMatchObject({ domain: null, domainStatus: null, domainRecords: [] });
  });

  it('stays pending when the provider is down', async () => {
    const deps = seedMessagingWorld({ messagingOverrides: { identity: createFakeEmailIdentity(new Error('boom')) } });
    expect((await updateEmailSettings(deps, admin, { senderName: 'X', fromAddress: 'a@b.com' })).domain).toMatchObject({ status: 'pending', records: [] });
  });

  it('is for owner and admin, and validates input', async () => {
    for (const role of ['recruiter', 'hiring_manager', 'interviewer'] as const) {
      expect(await rejection(updateEmailSettings(seedMessagingWorld(), userActor({ role, organizationId: ORG_A }), { senderName: 'X', fromAddress: null }))).toBeInstanceOf(ForbiddenError);
    }
    await expect(updateEmailSettings(seedMessagingWorld(), userActor({ role: 'owner', organizationId: ORG_A }), { senderName: 'X', fromAddress: null })).resolves.toBeDefined();
    expect(await rejection(updateEmailSettings(seedMessagingWorld(), admin, { senderName: 'X', fromAddress: 'not-an-email' }))).toBeInstanceOf(ValidationError);
  });
});

describe('verifyEmailDomain', () => {
  const withDomain = (identity = createFakeEmailIdentity({ status: 'verified', records: [] })) =>
    seedMessagingWorld({ messaging: { settings: [buildEmailSettings({ fromAddress: 'hr@acme.com', domain: 'acme.com', domainStatus: 'pending' })] }, messagingOverrides: { identity } });

  it('re-checks and stores the new status', async () => {
    const deps = withDomain();
    const view = await verifyEmailDomain(deps, admin, {});
    expect(view.domain?.status).toBe('verified');
    expect(view.effectiveFrom).toBe('"Acme Careers" <hr@acme.com>');
    expect(deps.auditLog.events()[0]).toMatchObject({ action: 'email_settings.updated', metadata: { domainStatus: 'verified' } });
  });

  it('needs a configured domain and a reachable provider', async () => {
    expect(await rejection(verifyEmailDomain(seedMessagingWorld(), admin, {}))).toBeInstanceOf(ConflictError);
    expect(await rejection(verifyEmailDomain(withDomain(createFakeEmailIdentity(new Error('down'))), admin, {}))).toBeInstanceOf(ConflictError);
    expect(await rejection(verifyEmailDomain(withDomain(), userActor({ role: 'recruiter', organizationId: ORG_A }), {}))).toBeInstanceOf(ForbiddenError);
  });
});
