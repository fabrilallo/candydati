import { JsonReaderError } from '../../../http/index.js';
import { PackageBuilderError, type PackageBuilder } from '../../package-builder.js';
import type { ConnectorTools } from '../../connector.js';
import { mapActivities, type MemberRef } from './activities.js';
import { JOB_STATES, type WorkableCandidate, type WorkableClient } from './client.js';
import { mapApplication, mapCandidate, mapJob } from './map.js';
import { createStageLookup, type StageLookup } from './stages.js';
import { z } from 'zod';
import { httpUrlOrNull } from '@candydati/domain';

/** What a run did: counted so the tests (and a future summary) can say what was left out. */
export interface WorkableRunStats {
  readonly users: number;
  readonly jobs: number;
  readonly candidates: number;
  readonly files: number;
  readonly skippedCandidates: number;
  readonly skippedFiles: number;
}

type Counts = { -readonly [K in keyof WorkableRunStats]: WorkableRunStats[K] };

interface RunContext {
  readonly client: WorkableClient;
  readonly builder: PackageBuilder;
  readonly progress: ConnectorTools['progress'];
  readonly lookup: StageLookup;
  readonly members: ReadonlyMap<string, MemberRef>;
  readonly now: string;
  readonly counts: Counts;
}

const emailOf = (value: string | null | undefined): string | null => {
  const parsed = z.email().max(254).safeParse((value ?? '').trim());
  return parsed.success ? parsed.data : null;
};

/** Members sign notes. Only the ones the package accepted are offered as authors. */
async function addUsers(client: WorkableClient, builder: PackageBuilder, counts: Counts): Promise<ReadonlyMap<string, MemberRef>> {
  const members = new Map<string, MemberRef>();
  for await (const member of client.members()) {
    const name = (member.name ?? '').trim().slice(0, 120);
    if (name === '' || members.has(member.id)) continue;
    const email = emailOf(member.email);
    try {
      builder.addUser({ ref: member.id, name, ...(email === null ? {} : { email }) });
    } catch (error) {
      if (error instanceof PackageBuilderError) continue;
      throw error;
    }
    members.set(member.id, { name, email });
    counts.users += 1;
  }
  return members;
}

async function addJobs(ctx: RunContext): Promise<readonly string[]> {
  const shortcodes: string[] = [];
  for (const state of JOB_STATES) {
    for await (const job of ctx.client.jobs(state)) {
      if (shortcodes.includes(job.shortcode)) continue;
      ctx.builder.addJob(mapJob(job, ctx.lookup, ctx.now));
      shortcodes.push(job.shortcode);
    }
  }
  ctx.counts.jobs = shortcodes.length;
  return shortcodes;
}

/** The CV, downloaded right after its record is read (the link expires). A failed download never stops the run. */
async function addResume(ctx: RunContext, candidate: WorkableCandidate): Promise<void> {
  const url = httpUrlOrNull(candidate.resume_url);
  if (url === null) return;
  const fileName = candidate.resume_metadata?.filename?.trim() || 'resume';
  try {
    await ctx.builder.addFile(candidate.id, { kind: 'cv', fileName }, (store) => ctx.client.download(url, store));
    ctx.counts.files += 1;
  } catch {
    ctx.counts.skippedFiles += 1;
  }
}

async function activitiesOf(client: WorkableClient, id: string) {
  const all = [];
  try {
    for await (const activity of client.activities(id)) all.push(activity);
  } catch (error) {
    if (!(error instanceof JsonReaderError && error.code === 'not_found')) throw error;
  }
  return all;
}

async function addCandidate(ctx: RunContext, shortcode: string, id: string): Promise<void> {
  const candidate = await ctx.client.candidate(id);
  await addResume(ctx, candidate);
  const activities = mapActivities(await activitiesOf(ctx.client, id), {
    candidateRef: candidate.id,
    applicationRef: candidate.id,
    candidateEmail: emailOf(candidate.email),
    lookup: ctx.lookup,
    members: ctx.members,
    disqualificationReason: (candidate.disqualification_reason ?? '').trim() || null,
  });
  ctx.builder.addCandidate(mapCandidate(candidate, ctx.now));
  ctx.builder.addApplication(mapApplication(candidate, shortcode, activities, ctx.lookup, ctx.now));
  for (const note of activities.notes) ctx.builder.addNote(note);
  for (const message of activities.messages) ctx.builder.addMessage(message);
}

/** A candidate Workable no longer has, or one the package refuses, is skipped and counted. Anything else stops the run. */
async function addCandidateOrSkip(ctx: RunContext, shortcode: string, id: string): Promise<void> {
  try {
    await addCandidate(ctx, shortcode, id);
    ctx.counts.candidates += 1;
  } catch (error) {
    const skippable = error instanceof PackageBuilderError || (error instanceof JsonReaderError && error.code === 'not_found');
    if (!skippable) throw error;
    ctx.counts.skippedCandidates += 1;
  }
}

/** Reads the whole account into the builder: members, pipeline, jobs of every state, then each job's candidates. */
export async function importWorkable(client: WorkableClient, builder: PackageBuilder, progress: ConnectorTools['progress'], now: Date = new Date()): Promise<WorkableRunStats> {
  const counts: Counts = { users: 0, jobs: 0, candidates: 0, files: 0, skippedCandidates: 0, skippedFiles: 0 };
  const members = await addUsers(client, builder, counts);
  const lookup = createStageLookup(await client.stages());
  const ctx: RunContext = { client, builder, progress, lookup, members, now: now.toISOString(), counts };
  await progress(0, null);
  const shortcodes = await addJobs(ctx);
  for (const shortcode of shortcodes) {
    for await (const id of client.candidateIds(shortcode)) {
      await addCandidateOrSkip(ctx, shortcode, id);
      await progress(counts.candidates + counts.skippedCandidates, null);
    }
  }
  return counts;
}
