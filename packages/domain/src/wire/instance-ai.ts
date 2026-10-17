import { z } from 'zod';
import { isoDate } from './common.js';

/** Providers the Mastra model router knows by default; the key of each is passed explicitly (never read from a file). */
export const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek', 'xai', 'openrouter'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
/**
 * `environment`: AGENT_MODEL or FAST_MODEL is set on the server and wins, the app shows it read-only. `app`: configured
 * from the app. `none`: no model; the assistant is off, the ad score uses rules and CVs are read as plain text.
 */
export const INSTANCE_AI_SOURCES = ['environment', 'app', 'none'] as const;
/** The `message` of the validation issue (path `test`) when a model refused the test call: nothing was saved. */
export const AI_TEST_FAILED = 'ai_test_failed';

/** A model name of the provider, without the `provider/` prefix (it is the chosen provider). */
const modelName = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/, 'a model name of the provider, without spaces or provider prefix');

/** One model: the provider it is reached through and its name at that provider. */
export const aiModelChoiceSchema = z.object({ provider: z.enum(AI_PROVIDERS), model: modelName });
export type AiModelChoice = z.infer<typeof aiModelChoiceSchema>;

/**
 * `PUT /api/v1/instance/ai-settings`: the assistant model and the fast model, each with its own provider and `null`
 * when switched off, and the API key of each provider in use. Saved only once each model switched on answered a test
 * call. A key left out keeps the one stored for that provider.
 */
export const instanceAiSettingsInputSchema = z.object({
  assistant: aiModelChoiceSchema.nullable(),
  fast: aiModelChoiceSchema.nullable(),
  keys: z.partialRecord(z.enum(AI_PROVIDERS), z.string().trim().min(1).max(512)).default({}),
});
export type InstanceAiSettingsInput = z.infer<typeof instanceAiSettingsInputSchema>;

/** `GET /api/v1/instance/ai-settings`: never a key, only which providers have one stored. */
export const instanceAiSettingsSchema = z.object({
  source: z.enum(INSTANCE_AI_SOURCES),
  /** The viewer may change it (first owner or instance admin, and not set by the environment). */
  canManage: z.boolean(),
  /** The models chosen (with `source: environment`, the ones of AGENT_MODEL and FAST_MODEL). */
  assistant: z.object({ provider: z.string(), model: z.string() }).nullable(),
  fast: z.object({ provider: z.string(), model: z.string() }).nullable(),
  /** The assistant panel works (a model and its key). */
  assistantEnabled: z.boolean(),
  /** The ad score and CV reading use the fast model (a model and its key). */
  fastEnabled: z.boolean(),
  /** Providers with a key stored (app source only). */
  storedKeys: z.array(z.enum(AI_PROVIDERS)),
  verifiedAt: isoDate.nullable(),
});
export type InstanceAiSettingsDto = z.infer<typeof instanceAiSettingsSchema>;
