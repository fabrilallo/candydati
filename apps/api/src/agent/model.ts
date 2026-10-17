import type { MastraModelConfig } from '@mastra/core/llm';
import { toMastraModel, type AiRuntime } from '@candydati/providers';

/** A model fixed (tests) or resolved at each call (the AI settings in force): what a Mastra agent takes as `model`. */
export type AgentModel = MastraModelConfig | (() => MastraModelConfig);

/**
 * The assistant model in force at each call, with its key when it comes from the app. The routes refuse the chat
 * before a call while no assistant model is on, so this never runs without one.
 */
export const liveAssistantModel = (ai: Pick<AiRuntime, 'snapshot'>): AgentModel => () => {
  const model = ai.snapshot().assistant;
  if (model === null) throw new Error('No assistant model is configured.');
  return toMastraModel(model) as MastraModelConfig;
};
