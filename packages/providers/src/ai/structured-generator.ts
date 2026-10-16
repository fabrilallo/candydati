import type { StructuredGenerator } from '@candydati/ad-quality';

export const GENERATOR_TIMEOUT_MS = 20_000;
export const GENERATOR_TEMPERATURE = 0.1;

interface StructuredAgent {
  generate(
    prompt: string,
    options: {
      structuredOutput: { schema: unknown; errorStrategy: 'strict' };
      modelSettings: { temperature: number; maxRetries: number };
      abortSignal: AbortSignal;
    },
  ): Promise<{ object?: unknown }>;
}

/** Mastra is loaded on the first call, so an instance without FAST_MODEL (or without keys) never imports it. */
async function loadAgent(model: string, system: string): Promise<StructuredAgent> {
  const { Agent } = await import('@mastra/core/agent');
  return new Agent({
    id: 'structured-generator',
    name: 'Structured generator',
    instructions: system,
    model: model as `${string}/${string}`,
  }) as unknown as StructuredAgent;
}

/**
 * `StructuredGenerator` on a Mastra agent: model string from env, no tools, no memory, low temperature, hard timeout.
 * The system prompt and the prompt come from the caller untouched.
 */
export function createMastraGenerator(model: string): StructuredGenerator {
  return async ({ system, prompt, schema }) => {
    const agent = await loadAgent(model, system);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema, errorStrategy: 'strict' },
      modelSettings: { temperature: GENERATOR_TEMPERATURE, maxRetries: 0 },
      abortSignal: AbortSignal.timeout(GENERATOR_TIMEOUT_MS),
    });
    if (result.object === undefined) throw new Error('The model returned no structured output.');
    return result.object;
  };
}
