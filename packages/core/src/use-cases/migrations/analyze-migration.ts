import { analyzeMigrationPackage, CV_MAX_BYTES, type MigrationBatch, type MigrationFileFacts, type MigrationPackage } from '@candydati/domain';
import { z } from 'zod';
import type { MigrationAnalysisDeps, OpenedMigrationPackageView } from '../../migration-ports.js';
import { inTransaction } from '../../transaction.js';
import { defineSystemJob } from '../../use-case.js';
import { deleteMigrationFile } from './shared.js';

/** Emails looked up per query: well under the Postgres parameter limit. */
const EMAIL_LOOKUP_CHUNK = 1000;

const analyzeInput = z.object({
  organizationId: z.string().min(1),
  batchId: z.string().min(1),
  /** True when the queue will not retry: an unexpected error then fails the batch instead of being retried. */
  lastAttempt: z.boolean().default(false),
});

export type MigrationAnalysisOutcome = 'ready' | 'failed' | 'skipped';

/**
 * Size of every referenced file, and for files declared `cv` whether the content really is a PDF or a Word document
 * (the declared name and type are never trusted). One file in memory at a time; files too large to be a CV are not read.
 */
async function fileFactsOf(deps: Pick<MigrationAnalysisDeps, 'cvSniffer'>, opened: OpenedMigrationPackageView): Promise<ReadonlyMap<string, MigrationFileFacts>> {
  const declared = new Map(opened.manifest.applications.flatMap((application) => application.files.map((file) => [file.path, file] as const)));
  const facts = new Map<string, MigrationFileFacts>();
  for (const [path, entry] of opened.files) {
    const file = declared.get(path);
    const sniff = file?.kind === 'cv' && entry.size <= CV_MAX_BYTES;
    const cvLike = sniff ? deps.cvSniffer(await entry.read(), file.fileName) !== null : null;
    facts.set(path, { size: entry.size, cvLike });
  }
  return facts;
}

/** The package's emails that already belong to a candidate of the organization, lowercased. */
async function existingEmailsOf(deps: Pick<MigrationAnalysisDeps, 'candidates'>, organizationId: string, manifest: MigrationPackage): Promise<ReadonlySet<string>> {
  const emails = [...new Set(manifest.candidates.flatMap((candidate) => (candidate.email === undefined ? [] : [candidate.email.toLowerCase()])))];
  const found = new Set<string>();
  for (let start = 0; start < emails.length; start += EMAIL_LOOKUP_CHUNK) {
    const people = await deps.candidates.findByEmails(organizationId, emails.slice(start, start + EMAIL_LOOKUP_CHUNK));
    for (const person of people) found.add(person.email.toLowerCase());
  }
  return found;
}

/** Computes the preview and stores it with the issues in one transaction: the batch is `ready` exactly when its issues exist. */
async function record(deps: MigrationAnalysisDeps, batch: MigrationBatch, opened: OpenedMigrationPackageView): Promise<MigrationBatch> {
  const { organizationId, id } = batch;
  const analysis = analyzeMigrationPackage({
    manifest: opened.manifest,
    now: deps.now(),
    notice: await deps.privacyNotices.findActive(organizationId),
    existingEmails: await existingEmailsOf(deps, organizationId, opened.manifest),
    files: await fileFactsOf(deps, opened),
    unreferenced: opened.unreferenced,
  });
  const issues = analysis.issues.map((issue) => ({ ...issue, id: deps.newId(), organizationId, batchId: id }));
  return inTransaction(deps, async (tx) => {
    await tx.migrationIssues.replaceAll(organizationId, id, issues);
    return tx.migrations.transition(organizationId, id, 'analyzing', {
      status: 'ready',
      sourceSystem: opened.manifest.source.system,
      producer: opened.manifest.source.producer,
      // A connector fetch's progress and number of parts stay with the preview.
      counts: batch.counts.fetch === undefined ? analysis.counts : { ...analysis.counts, fetch: batch.counts.fetch },
      stageMapping: analysis.stageMapping,
      excludedJobs: [],
      error: null,
      updatedAt: deps.now(),
    });
  });
}

/** The batch failed for good: the reason is shown to the operator; the package and any issue go (personal data). */
async function fail(deps: MigrationAnalysisDeps, batch: MigrationBatch, reason: string): Promise<'failed'> {
  await deps.migrations.transition(batch.organizationId, batch.id, 'analyzing', { status: 'failed', error: reason, updatedAt: deps.now() });
  await deps.migrationIssues.deleteByBatch(batch.organizationId, batch.id);
  await deleteMigrationFile(deps, batch.organizationId, batch.id, batch.packageKey);
  return 'failed';
}

/**
 * Task 3.2, worker of `migration.analyze`: the batch goes to `analyzing` (a retry finds it there), the package is opened
 * and checked (safe archive, schema, references, files present), then the preview is computed (`analyzeMigrationPackage`)
 * and the batch is left `ready`. A refused package fails the batch with the reader's code; an unexpected error is retried
 * by the queue and fails the batch only on the last attempt. Nothing about a person is written outside the batch.
 */
export const analyzeMigration = defineSystemJob<MigrationAnalysisDeps, typeof analyzeInput, MigrationAnalysisOutcome>({
  name: 'analyzeMigration',
  input: analyzeInput,
  handler: async ({ deps, input }) => {
    const found = await deps.migrations.findById(input.organizationId, input.batchId);
    if (!found || (found.status !== 'uploaded' && found.status !== 'analyzing')) return 'skipped';
    const batch = found.status === 'uploaded' ? await deps.migrations.transition(found.organizationId, found.id, 'uploaded', { status: 'analyzing', updatedAt: deps.now() }) : found;
    try {
      const opened = await deps.packages.open(batch.packageKey);
      if (!opened.ok) return await fail(deps, batch, opened.code);
      await record(deps, batch, opened.package);
      return 'ready';
    } catch (error) {
      if (!input.lastAttempt) throw error;
      return fail(deps, batch, 'analysis_failed');
    }
  },
});
