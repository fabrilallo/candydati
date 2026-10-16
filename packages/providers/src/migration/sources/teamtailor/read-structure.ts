import { JsonReaderError } from '../../../http/index.js';
import type { BuilderApplication } from '../../package-builder.js';
import { mapApplication, mapJob, mapUser } from './map.js';
import { attempt, type Run } from './run.js';
import { linkedId, type TeamtailorResource } from './schemas.js';

export interface KeptApplication {
  readonly item: BuilderApplication;
  readonly jobId: string;
}

export interface JobStructure {
  /** Job id -> ids of its stages. */
  readonly stagesByJob: ReadonlyMap<string, ReadonlySet<string>>;
  /** Stage id -> `stage-type` (Inbox, In process, Hired). */
  readonly stageTypes: ReadonlyMap<string, string | undefined>;
}

/** https://teamtailor-docs.netlify.app/ (Users): used to sign notes only. */
export async function readUsers(run: Run): Promise<ReadonlySet<string>> {
  const known = new Set<string>();
  for await (const user of run.client.list('/users', 'users', {}, run.tick)) {
    const mapped = mapUser(user);
    if (mapped !== undefined && (await attempt(() => run.builder.addUser(mapped)))) {
      known.add(mapped.ref);
      run.report.users += 1;
    }
  }
  return known;
}

/** Jobs of every status, each with its own stages (stages belong to one job, `GET /jobs/{id}/stages`). */
export async function readJobs(run: Run): Promise<JobStructure> {
  const stagesByJob = new Map<string, ReadonlySet<string>>();
  const stageTypes = new Map<string, string | undefined>();
  for await (const job of run.client.list('/jobs', 'jobs', { 'filter[status]': 'all' }, run.tick)) {
    const stages: TeamtailorResource<'stages'>[] = [];
    for await (const stage of run.client.list(`/jobs/${encodeURIComponent(job.id)}/stages`, 'stages', { sort: 'row_order' }, run.tick)) stages.push(stage);
    const mapped = mapJob(job, stages, run.now);
    if (mapped === undefined || !(await attempt(() => run.builder.addJob(mapped)))) continue;
    stagesByJob.set(job.id, new Set(stages.map((stage) => stage.id)));
    for (const stage of stages) stageTypes.set(stage.id, stage.attributes['stage-type'] ?? undefined);
    run.report.jobs += 1;
  }
  return { stagesByJob, stageTypes };
}

/** Reject reasons are read only to tell the company's rejection from the candidate's withdrawal. */
async function rejectionOrigins(run: Run): Promise<ReadonlyMap<string, boolean | undefined>> {
  const byCompany = new Map<string, boolean | undefined>();
  for await (const reason of run.client.list('/reject-reasons', 'rejectReasons', {}, run.tick)) byCompany.set(reason.id, reason.attributes['rejected-by-company'] ?? undefined);
  return byCompany;
}

/**
 * Applications are read before candidates and grouped by candidate, so a candidate's CV can be downloaded the moment its
 * record is read. `include` makes the API put the relation ids on each application (the docs show them only for
 * included relations). An application whose job or stage was not read, or whose relations are missing, is left out.
 */
export async function readApplications(run: Run, structure: JobStructure): Promise<ReadonlyMap<string, readonly KeptApplication[]>> {
  const reasons = await rejectionOrigins(run);
  const byCandidate = new Map<string, KeptApplication[]>();
  let seen = 0;
  let withoutLinks = 0;
  for await (const application of run.client.list('/job-applications', 'applications', { include: 'candidate,job,stage,reject-reason' }, run.tick)) {
    seen += 1;
    const candidateId = linkedId(application, 'candidate');
    const jobId = linkedId(application, 'job');
    const stageId = linkedId(application, 'stage');
    if (candidateId === undefined || jobId === undefined || stageId === undefined) {
      withoutLinks += 1;
      run.report.applicationsSkipped += 1;
    } else if (structure.stagesByJob.get(jobId)?.has(stageId) !== true) {
      run.report.applicationsSkipped += 1;
    } else {
      const reasonId = linkedId(application, 'reject-reason');
      const context = { jobId, stageId, candidateId, stageType: structure.stageTypes.get(stageId), rejectedByCompany: reasonId === undefined ? undefined : reasons.get(reasonId) };
      byCandidate.set(candidateId, [...(byCandidate.get(candidateId) ?? []), { item: mapApplication(application, context, run.now), jobId }]);
    }
  }
  // Every application without relations: the API did not honour `include`; importing nothing quietly would mislead.
  if (seen > 0 && withoutLinks === seen) throw new JsonReaderError('source_invalid_response');
  return byCandidate;
}
