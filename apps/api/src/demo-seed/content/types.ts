import type { ModelOutput } from '@candydati/ad-quality';
import type { AutomationActionInput, ClientDisplay, JobContentInput, Outcome, SelectionStage } from '@candydati/domain';

/** The kinds of CV the generator writes, one per family of roles in the demo. */
export const CV_PROFILES = ['backend', 'frontend', 'design', 'data', 'customer'] as const;
export type CvProfile = (typeof CV_PROFILES)[number];

/** How many applications sit at a stage of the job, and the decision when they are closed there. */
export interface PipelineSlot {
  readonly stage: string;
  readonly count: number;
  readonly outcome?: Outcome;
}

/** An interviewer of a stage: the organization's owner (a member) or an external person, by name and address. */
export type InterviewerSpec = { readonly stageId: string } & ({ readonly kind: 'owner' } | { readonly kind: 'external'; readonly name: string; readonly email: string });

export interface CriterionSpec {
  readonly key: string;
  readonly label: string;
  /** Null: asked at every declared stage. */
  readonly stageId: string | null;
}

/** A rule of the job. `send_template` names a template of the demo by its key, resolved to its id when built. */
export interface AutomationSpec {
  readonly key: string;
  readonly stageId: string;
  readonly action: AutomationActionInput;
}

export interface DemoJobSpec {
  readonly key: string;
  readonly status: 'draft' | 'published' | 'closed';
  readonly createdDaysAgo: number;
  readonly publishedDaysAgo?: number;
  readonly closedDaysAgo?: number;
  readonly content: Omit<JobContentInput, 'process'> & { readonly process: readonly (SelectionStage & { readonly id: string })[] };
  readonly restrictedStages: readonly string[];
  readonly criteria: readonly CriterionSpec[];
  readonly automations: readonly AutomationSpec[];
  readonly interviewers: readonly InterviewerSpec[];
  /** What a model answered when the ad was published: replayed through the real analyzer, never a candidate score. */
  readonly quality: ModelOutput | null;
  /** Set on the job recruited for the demo client. */
  readonly client: ClientDisplay | null;
  readonly profile: CvProfile;
  readonly pipeline: readonly PipelineSlot[];
  /** The hire of a closed job: days since the offer was accepted, days until the start. */
  readonly hire?: { readonly offerAcceptedDaysAgo: number; readonly startsInDays: number };
}
