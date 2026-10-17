import { hasProviderKey } from '@candydati/providers';

export { hasProviderKey, providerOf } from '@candydati/providers';

export interface AgentStatus {
  readonly enabled: boolean;
  /** `provider/model`, never a key. Null when the agent is not configured. */
  readonly model: string | null;
}

/** For the eval script, from the environment: enabled only with AGENT_MODEL and its provider key. */
export function agentStatus(agentModel: string | undefined, source: Readonly<Record<string, string | undefined>> = process.env): AgentStatus {
  if (!agentModel) return { enabled: false, model: null };
  return { enabled: hasProviderKey(agentModel, source), model: agentModel };
}
