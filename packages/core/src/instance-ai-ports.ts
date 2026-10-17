import type { InstanceAdmins } from './instance-email-ports.js';
import type { CredentialsBox } from './migration-fetch-ports.js';
import type { CoreDeps } from './ports.js';

/** Binds the sealed key to its purpose: an envelope from another table cannot be replayed here. */
export const INSTANCE_AI_SECRET_CONTEXT = 'instance-ai';

/** The row of `instance_ai_settings`: the key only as a sealed envelope; a model null is switched off. */
export interface InstanceAiRecord {
  readonly provider: string;
  readonly secretCiphertext: string | null;
  readonly assistantModel: string | null;
  readonly fastModel: string | null;
  readonly verifiedAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
}

export interface InstanceAiRepository {
  find(): Promise<InstanceAiRecord | null>;
  save(record: InstanceAiRecord): Promise<InstanceAiRecord>;
}

/** One tiny call to a model with a key that is not saved yet. Rejects with the provider's message (never the key). */
export interface AiModelCheck {
  check(model: { readonly id: `${string}/${string}`; readonly apiKey: string }): Promise<void>;
}

/** The AI runtime of the process: where the models in force come from, and which ones are on (`provider/model`). */
export interface InstanceAiState {
  snapshot(): { readonly source: 'environment' | 'app' | 'none'; readonly assistant: string | null; readonly fast: string | null };
  /** Reads the saved settings again (after a save, so the change applies at once). */
  refresh(): Promise<void>;
}

export interface InstanceAiDeps extends CoreDeps {
  readonly instanceAi: InstanceAiRepository;
  readonly aiState: InstanceAiState;
  readonly instanceAdmins: InstanceAdmins;
  /** Seals the key at rest (key derived from BETTER_AUTH_SECRET, its own HKDF info). */
  readonly aiSecrets: CredentialsBox;
  readonly aiCheck: AiModelCheck;
  readonly now: () => Date;
}
