/** Environment variable holding the API key of each provider the Mastra model router knows by default. */
const PROVIDER_KEYS: Readonly<Record<string, string>> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export interface AgentStatus {
  readonly enabled: boolean;
  /** `provider/model`, never a key. Null when the agent is not configured. */
  readonly model: string | null;
}

/** Provider of a `provider/model` string. */
export const providerOf = (model: string): string => model.slice(0, model.indexOf('/'));

/** True when the provider's key is set, or when the provider is not one we know (the router then decides). */
export function hasProviderKey(model: string, source: Readonly<Record<string, string | undefined>>): boolean {
  const variable = PROVIDER_KEYS[providerOf(model)];
  return variable === undefined || Boolean(source[variable]?.trim());
}

/** Enabled only with AGENT_MODEL and its provider key: otherwise the UI says the assistant is off. */
export function agentStatus(agentModel: string | undefined, source: Readonly<Record<string, string | undefined>> = process.env): AgentStatus {
  if (!agentModel) return { enabled: false, model: null };
  return { enabled: hasProviderKey(agentModel, source), model: agentModel };
}
