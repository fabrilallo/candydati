import { isJobScopedRole } from '@candydati/domain';
import type { Actor } from '../actor.js';
import type { JobTeamRepository } from '../job-team-ports.js';
import { createJobScopeContext, type JobScopeContext } from './job-scope.js';
import { scopeApplications, scopeCandidateSearch, scopeCandidates, scopeExtractions, scopeNotes } from './scoped-candidates.js';
import { scopeJobs, scopeStaleJobs } from './scoped-jobs.js';
import {
  scopeAutomationRules,
  scopeConversations,
  scopeFeedbackRequests,
  scopeImports,
  scopeInterviewFeedback,
  scopeMessages,
  scopeNotifications,
  scopePromises,
  scopeReports,
  scopeStageEvents,
  scopeStageInterviewers,
  scopeTasks,
} from './scoped-records.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the wrappers are keyed by dependency name; each one is typed in its own module */
type Wrapper = (raw: any, ctx: JobScopeContext) => unknown;

/**
 * The dependency keys that carry candidate or job data, and the scoped repository each one is replaced with. These are
 * the names the composition root (`createDrizzleRepositories`) and every `*Deps` interface use. A new repository that
 * holds candidate or job data gets its wrapper here; the leak test (`access/job-scope-leak.test.ts`) catches a forgotten one.
 */
const WRAPPERS: Readonly<Record<string, Wrapper>> = {
  jobs: scopeJobs,
  staleJobs: scopeStaleJobs,
  applications: scopeApplications,
  candidates: scopeCandidates,
  candidateSearch: scopeCandidateSearch,
  notes: scopeNotes,
  extractions: scopeExtractions,
  messages: scopeMessages,
  conversations: scopeConversations,
  feedbackRequests: scopeFeedbackRequests,
  interviewFeedback: scopeInterviewFeedback,
  stageInterviewers: scopeStageInterviewers,
  tasks: scopeTasks,
  notifications: scopeNotifications,
  reports: scopeReports,
  stageEvents: scopeStageEvents,
  promises: scopePromises,
  rules: scopeAutomationRules,
  automationRules: scopeAutomationRules,
  imports: scopeImports,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SCOPED_DEPENDENCY_KEYS: readonly string[] = Object.keys(WRAPPERS);

/** The scope context of one use case run, built on the deps it runs with (bound to its transaction when it has one). */
export const jobScopeOf = (deps: object, actor: Actor): JobScopeContext =>
  createJobScopeContext((deps as { readonly jobTeams?: JobTeamRepository }).jobTeams, actor);

const RAW = Symbol('job-scope.raw');

type Scoped<D> = D & { readonly [RAW]?: D };

/** The dependencies before scoping: a use case called from another one scopes them again for its own actor. */
export const unscopedDeps = <D extends object>(deps: D): D => (deps as Scoped<D>)[RAW] ?? deps;

/**
 * `deps` with every repository of candidate or job data limited to the jobs `actor` reaches. Owners, admins and the
 * system reach every job: their deps are returned as they are. Everything else (symbols of the unit of work included)
 * is kept, so `baseDeps` and nested transactions behave the same.
 */
export function scopeDeps<D extends object>(deps: D, actor: Actor, ctx: JobScopeContext = jobScopeOf(deps, actor)): D {
  if (actor.type === 'system' || !isJobScopedRole(actor.role)) return deps;
  const source = deps as Record<string, unknown>;
  const scoped: Record<string | symbol, unknown> = { ...source };
  for (const [key, wrap] of Object.entries(WRAPPERS)) {
    const raw = source[key];
    if (raw !== undefined && raw !== null) scoped[key] = wrap(raw, ctx);
  }
  scoped[RAW] = deps;
  return scoped as Scoped<D>;
}
