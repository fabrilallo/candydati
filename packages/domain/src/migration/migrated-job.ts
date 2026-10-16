import { jobContentSchema, type JobContent } from '../job/content.js';
import type { StageConductor, StageType } from '../job/taxonomy.js';
import type { MigrationTargetStage } from './choices.js';
import type { MigrationJob } from './package.js';

/**
 * What a migrated stage declares when the source says nothing about it: a usual length and who usually runs it. The
 * company reviews them before publishing a draft; a closed job only shows them in its history.
 */
export const MIGRATED_STAGE_DEFAULTS: Readonly<Record<StageType, { readonly durationMinutes: number; readonly conductedBy: StageConductor }>> = {
  screening_call: { durationMinutes: 30, conductedBy: 'recruiter' },
  hr_interview: { durationMinutes: 45, conductedBy: 'recruiter' },
  technical_interview: { durationMinutes: 60, conductedBy: 'technical_lead' },
  take_home_assignment: { durationMinutes: 120, conductedBy: 'technical_lead' },
  live_exercise: { durationMinutes: 60, conductedBy: 'technical_lead' },
  case_study: { durationMinutes: 60, conductedBy: 'hiring_manager' },
  team_interview: { durationMinutes: 45, conductedBy: 'team_member' },
  manager_interview: { durationMinutes: 45, conductedBy: 'hiring_manager' },
  final_interview: { durationMinutes: 45, conductedBy: 'hiring_manager' },
  offer: { durationMinutes: 30, conductedBy: 'hiring_manager' },
};

/**
 * The content of a migrated job: what the package says, its title, and the merged stages in order (stage ids are given
 * by the caller, like every new job). Parsed with the job schema, so defaults apply and nothing invalid is stored.
 * @throws ZodError when the package content does not make a valid job (the commit fails the batch with a code).
 */
export function migratedJobContent(job: Pick<MigrationJob, 'title' | 'content'>, stages: readonly MigrationTargetStage[]): JobContent {
  const process = stages.map((stage) => ({ type: stage.type, title: stage.title, ...MIGRATED_STAGE_DEFAULTS[stage.type] }));
  return jobContentSchema.parse({ ...job.content, title: job.title, process });
}
