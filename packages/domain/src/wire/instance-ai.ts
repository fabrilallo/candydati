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

/**
 * `PUT /api/v1/instance/ai-settings`: one provider and its key, the assistant model and the fast model, each `null`
 * when switched off. Saved only once each chosen model answered a test call. A key left out keeps the stored one.
 */
export const instanceAiSettingsInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().trim().min(1).max(512).optional(),
  assistantModel: modelName.nullable(),
  fastModel: modelName.nullable(),
});
export type InstanceAiSettingsInput = z.infer<typeof instanceAiSettingsInputSchema>;

/** `GET /api/v1/instance/ai-settings`: never the key, only whether one is stored. */
export const instanceAiSettingsSchema = z.object({
  source: z.enum(INSTANCE_AI_SOURCES),
  /** The viewer may change it (first owner or instance admin, and not set by the environment). */
  canManage: z.boolean(),
  provider: z.enum(AI_PROVIDERS).nullable(),
  hasApiKey: z.boolean(),
  /** Model names without the provider prefix; with `source: environment`, the full `provider/model` strings. */
  assistantModel: z.string().nullable(),
  fastModel: z.string().nullable(),
  /** The assistant panel works (a model and its key). */
  assistantEnabled: z.boolean(),
  /** The ad score and CV reading use the fast model (a model and its key). */
  fastEnabled: z.boolean(),
  verifiedAt: isoDate.nullable(),
});
export type InstanceAiSettingsDto = z.infer<typeof instanceAiSettingsSchema>;
