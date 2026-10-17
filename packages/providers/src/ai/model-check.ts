import { toMastraModel, type AiModelRef } from './runtime.js';

export const MODEL_CHECK_TIMEOUT_MS = 20_000;

interface TextAgent {
  generate(prompt: string, options: Record<string, unknown>): Promise<{ text?: string }>;
}

/**
 * One tiny call to a model before its settings are saved: the key, the model name and the account's credit are all
 * checked by the provider's answer. Rejects with the provider's message (never the key).
 */
export async function checkAiModel(model: AiModelRef): Promise<void> {
  const { Agent } = await import('@mastra/core/agent');
  const agent = new Agent({ id: 'model-check', name: 'Model check', instructions: 'Answer with the single word OK.', model: toMastraModel(model) }) as unknown as TextAgent;
  const result = await agent.generate('Reply with OK.', { modelSettings: { maxRetries: 0, maxOutputTokens: 5 }, abortSignal: AbortSignal.timeout(MODEL_CHECK_TIMEOUT_MS) });
  if ((result.text ?? '').trim() === '') throw new Error('The model gave no answer.');
}
