import { AI_PROVIDERS, AI_TEST_FAILED, instanceAiSettingsInputSchema, type AiProvider, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { INSTANCE_AI_SECRET_CONTEXT, type InstanceAiDeps, type InstanceAiRecord } from '../../instance-ai-ports.js';
import { defineUseCase } from '../../use-case.js';
import { mayManageInstance } from './may-manage.js';

const DETAIL_MAX = 300;
const ROLES = ['assistantModel', 'fastModel'] as const;

const userOf = (actor: Actor): string => actor.onBehalfOfUserId ?? actor.id ?? 'system';
const asProvider = (value: string): AiProvider | null => ((AI_PROVIDERS as readonly string[]).includes(value) ? (value as AiProvider) : null);

const toView = (deps: InstanceAiDeps, record: InstanceAiRecord | null, canManage: boolean): InstanceAiSettingsDto => {
  const state = deps.aiState.snapshot();
  const stored = state.source === 'app' ? record : null;
  const fromEnv = state.source === 'environment';
  return {
    source: state.source,
    canManage: canManage && !fromEnv,
    provider: stored ? asProvider(stored.provider) : fromEnv ? asProvider((state.assistant ?? state.fast ?? '').split('/')[0] ?? '') : null,
    hasApiKey: (stored?.secretCiphertext ?? null) !== null,
    assistantModel: fromEnv ? state.assistant : (stored?.assistantModel ?? null),
    fastModel: fromEnv ? state.fast : (stored?.fastModel ?? null),
    assistantEnabled: state.assistant !== null,
    fastEnabled: state.fast !== null,
    verifiedAt: stored?.verifiedAt.toISOString() ?? null,
  };
};

/** The key of the form, else the stored one for the same provider (a form left empty keeps it). */
const keyFor = (deps: InstanceAiDeps, input: InstanceAiSettingsInput, existing: InstanceAiRecord | null): string | undefined => {
  if (input.apiKey !== undefined) return input.apiKey;
  if (existing?.provider !== input.provider || existing.secretCiphertext === null) return undefined;
  return deps.aiSecrets.open(existing.secretCiphertext, INSTANCE_AI_SECRET_CONTEXT);
};

/** Each model switched on answers a test call with this key; the first refusal says which model and why. */
const checkModels = async (deps: InstanceAiDeps, input: InstanceAiSettingsInput, apiKey: string): Promise<void> => {
  for (const role of ROLES) {
    const name = input[role];
    if (name === null) continue;
    try {
      await deps.aiCheck.check({ id: `${input.provider}/${name}`, apiKey });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the provider refused the call';
      throw new ValidationError([{ path: 'test', message: AI_TEST_FAILED }, { path: 'test.detail', message: `${role}: ${detail}`.slice(0, DETAIL_MAX) }]);
    }
  }
};

/** Which models the instance uses and whether they are on (never the key). Every member may know it. */
export const getInstanceAiSettings = defineUseCase<InstanceAiDeps, z.ZodObject<Record<string, never>>, InstanceAiSettingsDto>({
  name: 'getInstanceAiSettings',
  input: z.object({}),
  permission: { skip: 'every member may know whether the assistant and the fast model are on' },
  audit: { skip: 'read of instance settings, no secret and no personal data' },
  handler: async ({ deps, actor }) => toView(deps, await deps.instanceAi.find(), await mayManageInstance(deps.instanceAdmins, actor)),
});

/**
 * Saved only once each model switched on answered a test call with the key, then applied at once by this process
 * (the others within their next refresh). Both off is allowed: it switches AI off. The key is sealed at rest.
 */
export const updateInstanceAiSettings = defineUseCase<InstanceAiDeps, typeof instanceAiSettingsInputSchema, InstanceAiSettingsDto>({
  name: 'updateInstanceAiSettings',
  input: instanceAiSettingsInputSchema,
  permission: 'email_settings:manage',
  audit: {
    action: 'ai_settings.updated',
    target: () => ({ type: 'instance_ai_settings', id: 'instance' }),
    metadata: (input) => ({ provider: input.provider, assistant: input.assistantModel !== null, fast: input.fastModel !== null }),
  },
  transaction: { skip: 'the test calls are long external calls: they run before the write, which needs no other row' },
  handler: async ({ deps, actor, input }) => {
    if (!(await mayManageInstance(deps.instanceAdmins, actor))) throw new ForbiddenError('Only the instance administrator can change the AI models.');
    if (deps.aiState.snapshot().source === 'environment') throw new ConflictError('The models are set by the server (AGENT_MODEL, FAST_MODEL): change them there.');
    const existing = await deps.instanceAi.find();
    const apiKey = keyFor(deps, input, existing);
    const anyOn = input.assistantModel !== null || input.fastModel !== null;
    if (anyOn && apiKey === undefined) throw new ValidationError([{ path: 'apiKey', message: 'required' }]);
    if (anyOn && apiKey !== undefined) await checkModels(deps, input, apiKey);
    const now = deps.now();
    const saved = await deps.instanceAi.save({
      provider: input.provider,
      secretCiphertext: apiKey === undefined ? null : deps.aiSecrets.seal(apiKey, INSTANCE_AI_SECRET_CONTEXT),
      assistantModel: input.assistantModel,
      fastModel: input.fastModel,
      verifiedAt: now,
      updatedAt: now,
      updatedBy: userOf(actor),
    });
    await deps.aiState.refresh();
    return toView(deps, saved, true);
  },
});
