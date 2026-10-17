import { AI_PROVIDERS, AI_TEST_FAILED, instanceAiSettingsInputSchema, type AiModelChoice, type AiProvider, type InstanceAiSettingsDto, type InstanceAiSettingsInput } from '@candydati/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../errors.js';
import { INSTANCE_AI_SECRET_CONTEXT, type InstanceAiDeps, type InstanceAiRecord } from '../../instance-ai-ports.js';
import { defineUseCase } from '../../use-case.js';
import { mayManageInstance } from './may-manage.js';

const DETAIL_MAX = 300;
type Keys = Readonly<Partial<Record<AiProvider, string>>>;

const userOf = (actor: Actor): string => actor.onBehalfOfUserId ?? actor.id ?? 'system';
const isProvider = (value: string): value is AiProvider => (AI_PROVIDERS as readonly string[]).includes(value);
const choiceOf = (provider: string | null, model: string | null) => (provider !== null && model !== null ? { provider, model } : null);
/** `openai/gpt-x` as `{ provider: 'openai', model: 'gpt-x' }` (the environment's strings). */
const splitModel = (id: string | null) => (id === null ? null : { provider: id.slice(0, id.indexOf('/')), model: id.slice(id.indexOf('/') + 1) });

const storedKeys = (deps: InstanceAiDeps, record: InstanceAiRecord | null): Keys => {
  if ((record?.keysCiphertext ?? null) === null) return {};
  const parsed: unknown = JSON.parse(deps.aiSecrets.open(record?.keysCiphertext ?? '', INSTANCE_AI_SECRET_CONTEXT));
  return Object.fromEntries(Object.entries(parsed as Record<string, string>).filter(([provider]) => isProvider(provider))) as Keys;
};

const toView = (deps: InstanceAiDeps, record: InstanceAiRecord | null, canManage: boolean): InstanceAiSettingsDto => {
  const state = deps.aiState.snapshot();
  const fromEnv = state.source === 'environment';
  const stored = state.source === 'app' ? record : null;
  return {
    source: state.source,
    canManage: canManage && !fromEnv,
    assistant: fromEnv ? splitModel(state.assistant) : choiceOf(stored?.assistantProvider ?? null, stored?.assistantModel ?? null),
    fast: fromEnv ? splitModel(state.fast) : choiceOf(stored?.fastProvider ?? null, stored?.fastModel ?? null),
    assistantEnabled: state.assistant !== null,
    fastEnabled: state.fast !== null,
    storedKeys: (Object.keys(storedKeys(deps, stored)) as AiProvider[]).sort(),
    verifiedAt: stored?.verifiedAt.toISOString() ?? null,
  };
};

const ROLES = [
  ['assistant', (input: InstanceAiSettingsInput) => input.assistant],
  ['fast', (input: InstanceAiSettingsInput) => input.fast],
] as const;

/** The key of each provider in use: the one sent, else the one stored; a model whose provider has none is refused. */
const keysInUse = (input: InstanceAiSettingsInput, stored: Keys): Keys => {
  const providers = [...new Set(ROLES.map(([, of]) => of(input)?.provider).filter((p): p is AiProvider => p !== undefined))];
  const missing = providers.filter((provider) => (input.keys[provider] ?? stored[provider]) === undefined);
  if (missing.length > 0) throw new ValidationError(missing.map((provider) => ({ path: `keys.${provider}`, message: 'required' })));
  return Object.fromEntries(providers.map((provider) => [provider, input.keys[provider] ?? stored[provider]]));
};

/** Each model switched on answers a test call with the key of its provider; the first refusal says which and why. */
const checkModels = async (deps: InstanceAiDeps, input: InstanceAiSettingsInput, keys: Keys): Promise<void> => {
  for (const [role, of] of ROLES) {
    const choice: AiModelChoice | null = of(input);
    if (choice === null) continue;
    try {
      await deps.aiCheck.check({ id: `${choice.provider}/${choice.model}`, apiKey: keys[choice.provider] ?? '' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the provider refused the call';
      throw new ValidationError([{ path: 'test', message: AI_TEST_FAILED }, { path: 'test.detail', message: `${role}: ${detail}`.slice(0, DETAIL_MAX) }]);
    }
  }
};

/** Which models the instance uses, their providers and whether they are on (never a key). Every member may know it. */
export const getInstanceAiSettings = defineUseCase<InstanceAiDeps, z.ZodObject<Record<string, never>>, InstanceAiSettingsDto>({
  name: 'getInstanceAiSettings',
  input: z.object({}),
  permission: { skip: 'every member may know whether the assistant and the fast model are on' },
  audit: { skip: 'read of instance settings, no secret and no personal data' },
  handler: async ({ deps, actor }) => toView(deps, await deps.instanceAi.find(), await mayManageInstance(deps.instanceAdmins, actor)),
});

/**
 * Saved only once each model switched on answered a test call with the key of its provider, then applied at once by
 * this process (the others within their next refresh). Both off is allowed: it switches AI off. Only the keys of the
 * providers in use are kept, sealed at rest.
 */
export const updateInstanceAiSettings = defineUseCase<InstanceAiDeps, typeof instanceAiSettingsInputSchema, InstanceAiSettingsDto>({
  name: 'updateInstanceAiSettings',
  input: instanceAiSettingsInputSchema,
  permission: 'email_settings:manage',
  audit: {
    action: 'ai_settings.updated',
    target: () => ({ type: 'instance_ai_settings', id: 'instance' }),
    metadata: (input) => ({ assistant: input.assistant?.provider ?? null, fast: input.fast?.provider ?? null }),
  },
  transaction: { skip: 'the test calls are long external calls: they run before the write, which needs no other row' },
  handler: async ({ deps, actor, input }) => {
    if (!(await mayManageInstance(deps.instanceAdmins, actor))) throw new ForbiddenError('Only the instance administrator can change the AI models.');
    if (deps.aiState.snapshot().source === 'environment') throw new ConflictError('The models are set by the server (AGENT_MODEL, FAST_MODEL): change them there.');
    const keys = keysInUse(input, storedKeys(deps, await deps.instanceAi.find()));
    await checkModels(deps, input, keys);
    const now = deps.now();
    const saved = await deps.instanceAi.save({
      assistantProvider: input.assistant?.provider ?? null,
      assistantModel: input.assistant?.model ?? null,
      fastProvider: input.fast?.provider ?? null,
      fastModel: input.fast?.model ?? null,
      keysCiphertext: Object.keys(keys).length === 0 ? null : deps.aiSecrets.seal(JSON.stringify(keys), INSTANCE_AI_SECRET_CONTEXT),
      verifiedAt: now,
      updatedAt: now,
      updatedBy: userOf(actor),
    });
    await deps.aiState.refresh();
    return toView(deps, saved, true);
  },
});
