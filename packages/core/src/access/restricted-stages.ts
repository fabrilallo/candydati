import { readsEveryRestrictedStage, type RestrictedStage } from '@candydati/domain';
import type { Actor } from '../actor.js';
import type { JobTeamRepository } from '../job-team-ports.js';
import { MissingJobTeamsError } from './job-scope.js';

/**
 * Restricted stages (PRODUCT.md §6.2): the notes and feedback written at a restricted stage of a job are read only by
 * owners, admins, the job's hiring manager and their own authors. Everyone else gets nothing of them: no row, no count.
 * Resolved once per use case run and lazily; owners, admins and the system never pay a lookup.
 */
export interface StageRestrictionContext {
  /** Stage id -> the jobs where that stage is hidden from this actor. Empty: the actor reads every stage. */
  hidden(): Promise<ReadonlyMap<string, ReadonlySet<string>>>;
  /** The items the actor may read, in the same order. */
  visible<T>(items: readonly T[], about: (item: T) => RestrictedItem): Promise<readonly T[]>;
}

/** What decides whether one note, feedback or feedback request is readable. */
export interface RestrictedItem {
  readonly applicationId: string | null;
  readonly stageId: string | null;
  /** The people who wrote it (or were asked to): they always read it. */
  readonly authorIds: readonly (string | null)[];
}

const NOTHING_HIDDEN: ReadonlyMap<string, ReadonlySet<string>> = new Map();

const personOf = (actor: Actor): string | null => (actor.type === 'user' ? actor.id : actor.onBehalfOfUserId);

async function managedJobs(jobTeams: JobTeamRepository, organizationId: string, person: string | null, jobIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (person === null) return new Set();
  const managed: string[] = [];
  for (const jobId of jobIds) {
    const team = await jobTeams.list(organizationId, jobId);
    if (team.some((member) => member.userId === person && member.role === 'hiring_manager')) managed.push(jobId);
  }
  return new Set(managed);
}

const byStage = (stages: readonly RestrictedStage[]): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map([...new Set(stages.map((stage) => stage.stageId))].map((stageId) => [stageId, new Set(stages.filter((s) => s.stageId === stageId).map((s) => s.jobId))]));

/** The restricted stages hidden from `actor`: all of them, minus the jobs where the person is the hiring manager. */
export async function resolveHiddenStages(jobTeams: JobTeamRepository | undefined, actor: Actor): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  if (actor.type === 'system' || readsEveryRestrictedStage(actor.role)) return NOTHING_HIDDEN;
  if (!jobTeams) throw new MissingJobTeamsError();
  const stages = await jobTeams.listRestrictedStages(actor.organizationId);
  if (stages.length === 0) return NOTHING_HIDDEN;
  const managed = await managedJobs(jobTeams, actor.organizationId, personOf(actor), [...new Set(stages.map((stage) => stage.jobId))]);
  return byStage(stages.filter((stage) => !managed.has(stage.jobId)));
}

const keyOf = (applicationId: string, stageId: string): string => `${applicationId}\u0000${stageId}`;

export function createStageRestrictionContext(jobTeams: JobTeamRepository | undefined, actor: Actor): StageRestrictionContext {
  let resolved: Promise<ReadonlyMap<string, ReadonlySet<string>>> | undefined;
  const hidden = () => {
    resolved ??= resolveHiddenStages(jobTeams, actor);
    return resolved;
  };
  const person = personOf(actor);
  /** The (application, stage) pairs among `suspects` whose application belongs to a job where the stage is hidden. */
  const hiddenPairs = async (map: ReadonlyMap<string, ReadonlySet<string>>, suspects: readonly RestrictedItem[]): Promise<ReadonlySet<string>> => {
    if (!jobTeams) throw new MissingJobTeamsError();
    const applicationIds = [...new Set(suspects.map((item) => item.applicationId as string))];
    const jobIds = [...new Set(suspects.flatMap((item) => [...(map.get(item.stageId as string) ?? [])]))];
    const pairs: string[] = [];
    for (const jobId of jobIds) {
      const inJob = new Set(await jobTeams.applicationsIn(actor.organizationId, applicationIds, [jobId]));
      for (const item of suspects) {
        if (inJob.has(item.applicationId as string) && map.get(item.stageId as string)?.has(jobId)) pairs.push(keyOf(item.applicationId as string, item.stageId as string));
      }
    }
    return new Set(pairs);
  };
  return {
    hidden,
    async visible(items, about) {
      const map = await hidden();
      if (map.size === 0 || items.length === 0) return items;
      const suspect = (item: RestrictedItem): boolean =>
        item.applicationId !== null && item.stageId !== null && map.has(item.stageId) && !(person !== null && item.authorIds.includes(person));
      const suspects = items.map(about).filter(suspect);
      if (suspects.length === 0) return items;
      const pairs = await hiddenPairs(map, suspects);
      return items.filter((item) => {
        const facts = about(item);
        return !(suspect(facts) && pairs.has(keyOf(facts.applicationId as string, facts.stageId as string)));
      });
    },
  };
}
