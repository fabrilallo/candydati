import { JsonReaderError } from '../../../http/index.js';
import type { ConnectorTools } from '../../connector.js';
import { PackageBuilderError, type PackageBuilder } from '../../package-builder.js';
import type { GreenhouseClient } from './client.js';
import { addressesIn, fileKindOf, mapApplication, mapCandidate, mapEmail, mapJob, mapNote, mapUser } from './map.js';
import { applicationSchema, applicationStageSchema, attachmentSchema, candidateSchema, jobSchema, noteSchema, sourceSchema, stageSchema, userSchema, type GhApplicationStage, type GhStage } from './schemas.js';
import { MIGRATION_LIMITS } from '@candydati/domain';

/** `job_ids` takes at most 50 ids per request (https://harvestdocs.greenhouse.io/reference/get_v3-job-interview-stages.md). */
const IDS_PER_REQUEST = 50;

/** What the run learned so far: only ids and addresses, to keep every later record pointing at something that exists. */
interface Known {
  readonly users: Set<string>;
  readonly stagesByJob: Map<string, readonly string[]>;
  readonly candidateEmails: Map<string, ReadonlySet<string>>;
  readonly applications: Map<string, { readonly candidate: string; cvs: number; files: number }>;
}

interface Run {
  readonly client: GreenhouseClient;
  readonly builder: PackageBuilder;
  readonly tools: ConnectorTools;
  readonly known: Known;
  done: number;
}

/** Counts a record and reports progress: a page is at most 500 records, well inside the minute the batch allows. */
const tick = async (run: Run, count: number): Promise<void> => {
  run.done += count;
  await run.tools.progress(run.done, null);
};

/** Runs `add`; a record the package refuses (an invalid value) is skipped, anything else is a real failure. */
function accepted(add: () => void): boolean {
  try {
    add();
    return true;
  } catch (error) {
    if (error instanceof PackageBuilderError && (error.code === 'invalid_item' || error.code === 'duplicate_ref')) return false;
    throw error;
  }
}

async function readUsers(run: Run): Promise<void> {
  for await (const page of run.client.pages('users', {}, userSchema)) {
    for (const user of page) {
      const mapped = mapUser(user);
      if (mapped && accepted(() => run.builder.addUser(mapped))) run.known.users.add(mapped.ref);
    }
    await tick(run, page.length);
  }
}

/** Source names for the application origin. The endpoint is not in the docs' index: a refusal just leaves origins out. */
async function readSources(run: Run): Promise<ReadonlyMap<number, string>> {
  const names = new Map<number, string>();
  try {
    for await (const page of run.client.pages('sources', {}, sourceSchema)) for (const source of page) names.set(source.id, source.name);
  } catch (error) {
    if (!(error instanceof JsonReaderError) || (error.code !== 'credentials_refused' && error.code !== 'not_found')) throw error;
  }
  return names;
}

async function readStages(run: Run, jobIds: readonly number[]): Promise<ReadonlyMap<number, readonly GhStage[]>> {
  const byJob = new Map<number, GhStage[]>();
  for (let i = 0; i < jobIds.length; i += IDS_PER_REQUEST) {
    const ids = jobIds.slice(i, i + IDS_PER_REQUEST).join(',');
    for await (const page of run.client.pages('job_interview_stages', { job_ids: ids }, stageSchema)) {
      for (const stage of page) byJob.set(stage.job_id, [...(byJob.get(stage.job_id) ?? []), stage]);
      await tick(run, page.length);
    }
  }
  return byJob;
}

async function readJobs(run: Run): Promise<void> {
  const jobs = [];
  for await (const page of run.client.pages('jobs', {}, jobSchema)) {
    jobs.push(...page.filter((job) => job.is_template !== true));
    await tick(run, page.length);
  }
  const stages = await readStages(run, jobs.map((job) => job.id));
  for (const job of jobs) {
    const mapped = mapJob(job, stages.get(job.id) ?? []);
    if (mapped && accepted(() => run.builder.addJob(mapped))) run.known.stagesByJob.set(mapped.ref, (mapped.stages ?? []).map((stage) => stage.ref));
  }
}

async function readCandidates(run: Run): Promise<void> {
  for await (const page of run.client.pages('candidates', {}, candidateSchema)) {
    for (const candidate of page) {
      const mapped = mapCandidate(candidate);
      if (mapped && accepted(() => run.builder.addCandidate(mapped))) {
        run.known.candidateEmails.set(mapped.ref, new Set((candidate.email_addresses ?? []).flatMap((e) => addressesIn(e.value))));
      }
    }
    await tick(run, page.length);
  }
}

async function readHistory(run: Run): Promise<ReadonlyMap<number, readonly GhApplicationStage[]>> {
  const byApplication = new Map<number, GhApplicationStage[]>();
  for await (const page of run.client.pages('application_stages', {}, applicationStageSchema)) {
    for (const entry of page) byApplication.set(entry.application_id, [...(byApplication.get(entry.application_id) ?? []), entry]);
    await tick(run, page.length);
  }
  return byApplication;
}

async function readApplications(run: Run): Promise<void> {
  const sources = await readSources(run);
  const history = await readHistory(run);
  for await (const page of run.client.pages('applications', {}, applicationSchema)) {
    for (const application of page) {
      const jobStages = run.known.stagesByJob.get(String(application.job_id));
      if (jobStages === undefined || !run.known.candidateEmails.has(String(application.candidate_id))) continue;
      const mapped = mapApplication(application, { jobStages, history: history.get(application.id) ?? [], sourceName: application.source_id === null || application.source_id === undefined ? undefined : sources.get(application.source_id) });
      if (mapped && accepted(() => run.builder.addApplication(mapped))) run.known.applications.set(mapped.ref, { candidate: mapped.candidateRef, cvs: 0, files: 0 });
    }
    await tick(run, page.length);
  }
}

/** Notes and emails only; every other note type (activity, interview, feedback, forms) is ignored on purpose. */
async function readNotes(run: Run): Promise<void> {
  for await (const page of run.client.pages('notes', { type: 'NOTE,EMAIL' }, noteSchema)) {
    for (const note of page) {
      const candidate = String(note.candidate_id);
      const application = run.known.applications.get(String(note.application_id));
      const applicationOk = application !== undefined && application.candidate === candidate;
      const emails = run.known.candidateEmails.get(candidate);
      if (emails === undefined) continue;
      if (note.type === 'NOTE') {
        const mapped = mapNote(note, run.known.users, applicationOk);
        if (mapped) accepted(() => run.builder.addNote(mapped));
      } else if (note.type === 'EMAIL' && applicationOk) {
        const mapped = mapEmail(note, emails);
        if (mapped) accepted(() => run.builder.addMessage(mapped));
      }
    }
    await tick(run, page.length);
  }
}

/** A file that cannot be fetched (expired or foreign URL, too large, source error) is skipped: the rest goes on. */
const isSkippable = (error: unknown): boolean => error instanceof JsonReaderError || (error instanceof PackageBuilderError && error.code === 'file_too_large');

async function readAttachments(run: Run): Promise<void> {
  for await (const page of run.client.pages('attachments', {}, attachmentSchema)) {
    for (const attachment of page) {
      const application = run.known.applications.get(String(attachment.application_id));
      const kind = fileKindOf(attachment);
      if (application === undefined || kind === null || application.files >= MIGRATION_LIMITS.filesPerApplication) continue;
      // A second resume would make the package invalid (one CV per application): it comes across as another file.
      const effective = kind === 'cv' && application.cvs > 0 ? 'other' : kind;
      try {
        // The signed URL lives seven days, so the file is downloaded right now, while its record is in hand.
        await run.builder.addFile(String(attachment.application_id), { kind: effective, fileName: attachment.filename }, (store) => run.client.download(attachment.url, store));
        application.files += 1;
        if (effective === 'cv') application.cvs += 1;
      } catch (error) {
        if (!isSkippable(error)) throw error;
      }
      await run.tools.progress(run.done, null);
    }
    await tick(run, page.length);
  }
}

/** The whole read, in dependency order: people and plans first, then what hangs from applications. */
export async function readGreenhouse(client: GreenhouseClient, builder: PackageBuilder, tools: ConnectorTools): Promise<void> {
  const known: Known = { users: new Set(), stagesByJob: new Map(), candidateEmails: new Map(), applications: new Map() };
  const run: Run = { client, builder, tools, known, done: 0 };
  await tools.progress(0, null);
  await readUsers(run);
  await readJobs(run);
  await readCandidates(run);
  await readApplications(run);
  await readNotes(run);
  await readAttachments(run);
}
