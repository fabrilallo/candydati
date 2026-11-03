import type { MastraModelConfig } from '@mastra/core/llm';
import type { MockLanguageModelV3 } from 'ai/test';

/**
 * A mock model from `ai/test` as the model a Mastra agent takes. The mock is typed against the `@ai-sdk/provider`
 * that `ai` depends on, while Mastra ships its own frozen copy of the same specification types; when `ai` moves ahead
 * (a new finish reason, readonly JSON values) the two copies stop being structurally identical although the runtime
 * contract is the same. The tests only ever produce values both copies accept, so the mock is handed over here, at
 * this single seam, instead of loosening the production types.
 */
export const asAgentModel = (model: MockLanguageModelV3): MastraModelConfig => model as unknown as MastraModelConfig;
