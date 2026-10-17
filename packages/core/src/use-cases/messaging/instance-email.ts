import { EMAIL_TEST_FAILED, instanceEmailSettingsInputSchema, type InstanceEmailSettingsDto, type InstanceEmailSettingsInput } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { INSTANCE_EMAIL_SECRET_CONTEXT, type InstanceEmailDeps, type InstanceEmailRecord, type InstanceEmailTransport } from '../../instance-email-ports.js';
import { authorize } from '../../authorization.js';
import { defineUseCase } from '../../use-case.js';

const DEFAULT_FROM_LOCAL = 'noreply';
const DETAIL_MAX = 300;

const userOf = (actor: Actor): string => actor.onBehalfOfUserId ?? actor.id ?? 'system';

/** The first owner or an instance admin, with the organization permission to manage email (never an API key alone). */
const mayManage = async (deps: InstanceEmailDeps, actor: Actor): Promise<boolean> => {
  if (actor.type !== 'user') return false;
  try {
    authorize(actor, 'email_settings:manage');
  } catch {
    return false;
  }
  return deps.instanceAdmins.isInstanceAdmin(actor.id);
};

const toView = (deps: InstanceEmailDeps, record: InstanceEmailRecord | null, canManage: boolean): InstanceEmailSettingsDto => {
  const source = deps.emailState.source();
  const stored = source === 'app' ? record : null;
  return {
    source,
    ready: deps.emailState.ready(),
    canManage: canManage && source !== 'environment',
    provider: stored?.provider ?? null,
    smtp: stored?.provider === 'smtp' ? { host: stored.smtpHost ?? '', port: stored.smtpPort ?? 0, secure: stored.smtpSecure, user: stored.smtpUser ?? '', hasPassword: stored.secretCiphertext !== null } : null,
    resend: stored?.provider === 'resend' ? { hasApiKey: stored.secretCiphertext !== null } : null,
    sendingDomain: stored?.sendingDomain ?? null,
    fromLocal: stored?.fromLocal ?? DEFAULT_FROM_LOCAL,
    verifiedAt: stored?.verifiedAt.toISOString() ?? null,
  };
};

/** The secret of the form, else the stored one for the same provider (a form left empty keeps it). */
const secretFor = (deps: InstanceEmailDeps, input: InstanceEmailSettingsInput, existing: InstanceEmailRecord | null): string | undefined => {
  const given = input.provider === 'smtp' ? input.smtp.password : input.resend.apiKey;
  if (given !== undefined) return given;
  if (existing?.provider !== input.provider || existing.secretCiphertext === null) return undefined;
  return deps.emailSecrets.open(existing.secretCiphertext, INSTANCE_EMAIL_SECRET_CONTEXT);
};

const transportOf = (input: InstanceEmailSettingsInput, secret: string | undefined): InstanceEmailTransport => {
  if (input.provider === 'smtp') return { kind: 'smtp', host: input.smtp.host, port: input.smtp.port, secure: input.smtp.secure, user: input.smtp.user || undefined, password: secret };
  if (secret === undefined) throw new ValidationError([{ path: 'resend.apiKey', message: 'required' }]);
  return { kind: 'resend', apiKey: secret };
};

const sendTest = async (deps: InstanceEmailDeps, actor: Actor, input: InstanceEmailSettingsInput, transport: InstanceEmailTransport): Promise<void> => {
  const to = await deps.instanceAdmins.emailOf(userOf(actor));
  if (to === null) throw new ConflictError('The test email needs your own address.');
  const name = deps.platformName.replace(/["\\\r\n]/g, ' ');
  try {
    await deps.emailTester.send(transport, {
      from: `"${name}" <${input.fromLocal}@${input.sendingDomain}>`,
      to,
      subject: `${deps.platformName}: email works`,
      text: `This test email confirms that ${deps.platformName} can send email from ${input.fromLocal}@${input.sendingDomain}.`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, DETAIL_MAX) : 'the provider refused the email';
    throw new ValidationError([{ path: 'test', message: EMAIL_TEST_FAILED }, { path: 'test.detail', message: detail }]);
  }
};

/** Whether the instance sends email and how (never a secret). Every member may know it: the app shows when it cannot. */
export const getInstanceEmailSettings = defineUseCase<InstanceEmailDeps, z.ZodObject<Record<string, never>>, InstanceEmailSettingsDto>({
  name: 'getInstanceEmailSettings',
  input: z.object({}),
  permission: { skip: 'every member may know whether the instance can send email' },
  audit: { skip: 'read of instance settings, no secret and no personal data' },
  handler: async ({ deps, actor }) => toView(deps, await deps.instanceEmail.find(), await mayManage(deps, actor)),
});

/**
 * Saved only once a test email to the admin went through with these settings, then applied at once by this process
 * (the others pick it up at their next refresh). The secret is sealed at rest and never returned.
 */
export const updateInstanceEmailSettings = defineUseCase<InstanceEmailDeps, typeof instanceEmailSettingsInputSchema, InstanceEmailSettingsDto>({
  name: 'updateInstanceEmailSettings',
  input: instanceEmailSettingsInputSchema,
  permission: 'email_settings:manage',
  audit: {
    action: 'email_settings.updated',
    target: () => ({ type: 'instance_email_settings', id: 'instance' }),
    metadata: (input) => ({ provider: input.provider, sendingDomain: input.sendingDomain }),
  },
  transaction: { skip: 'the test email is a long external call: it runs before the write, which needs no other row' },
  handler: async ({ deps, actor, input }) => {
    if (!(await mayManage(deps, actor))) throw new ForbiddenError('Only the instance administrator can change how the instance sends email.');
    if (deps.emailState.source() === 'environment') throw new ConflictError('Email is set by the server (EMAIL_PROVIDER): change it there.');
    const existing = await deps.instanceEmail.find();
    const secret = secretFor(deps, input, existing);
    const transport = transportOf(input, secret);
    await sendTest(deps, actor, input, transport);
    const now = deps.now();
    const saved = await deps.instanceEmail.save({
      provider: input.provider,
      smtpHost: input.provider === 'smtp' ? input.smtp.host : null,
      smtpPort: input.provider === 'smtp' ? input.smtp.port : null,
      smtpSecure: input.provider === 'smtp' && input.smtp.secure,
      smtpUser: input.provider === 'smtp' ? input.smtp.user || null : null,
      secretCiphertext: secret === undefined ? null : deps.emailSecrets.seal(secret, INSTANCE_EMAIL_SECRET_CONTEXT),
      sendingDomain: input.sendingDomain,
      fromLocal: input.fromLocal,
      verifiedAt: now,
      updatedAt: now,
      updatedBy: userOf(actor),
    });
    await deps.emailState.refresh();
    return toView(deps, saved, true);
  },
});
