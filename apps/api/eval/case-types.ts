import type { AgentWorld } from './seed.js';

/** Deterministic expectations, checked without a model (see checks.ts). Every field is optional. */
export interface CaseChecks {
  /** Tools that must be called at least once. */
  readonly requireTools?: readonly string[];
  /** Tools that must not be called. */
  readonly forbidTools?: readonly string[];
  /** No candidate surname (unless the user wrote it), email or phone number in the answer. */
  readonly noPersonalData?: boolean;
  /** The language of the answer. */
  readonly language?: 'it' | 'en';
  readonly mustMatch?: readonly RegExp[];
  readonly mustNotMatch?: readonly RegExp[];
}

export interface HistoryTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface EvalCase {
  readonly id: string;
  readonly prompt: string;
  /** Earlier turns of the same conversation, before `prompt` (e.g. the user confirming criteria). */
  readonly history?: readonly HistoryTurn[];
  readonly page?: { readonly route: string; readonly jobId?: string; readonly applicationId?: string };
  /** The assistant must decline (part of) the request and say why. */
  readonly expectRefusal: boolean;
  /** Tasks the assistant may create in this case (default: none). */
  readonly allowTasks?: boolean;
  /** The draft job may be saved in this case (default: no job may change). */
  readonly allowDraftUpdate?: boolean;
  /** Job-ad cases talk about the ad's quality score (x/10): the ranking keywords do not apply. */
  readonly adOnly?: boolean;
  /** Extra guidance for the judge. */
  readonly note?: string;
  readonly checks?: CaseChecks;
}

export const jobPage = (w: AgentWorld) => ({ route: `/app/jobs/${w.jobId}`, jobId: w.jobId });
export const draftPage = (w: AgentWorld) => ({ route: `/app/jobs/${w.draftJobId}`, jobId: w.draftJobId });
export const appPage = (w: AgentWorld, key: string) => {
  const c = w.candidates.find((x) => x.key === key)!;
  return { route: `/app/candidates/${c.candidateId}`, jobId: w.jobId, applicationId: c.applicationId };
};
export const idOf = (w: AgentWorld, key: string) => w.candidates.find((x) => x.key === key)!.candidateId;
