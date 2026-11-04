import type { FileStorage } from '@candydati/core';
import type { Db } from '@candydati/db';
import { createHash, randomBytes } from 'node:crypto';
import { auditEventsFor } from './audit.js';
import { buildDemoDataset } from './build/dataset.js';
import { demoNoticeInput } from './content/notice.js';
import type { DemoContext } from './dataset.js';
import { demoId } from './ids.js';
import { describePlan, isNoop, planSeed, type SeedPlan } from './plan.js';
import { applyPlan } from './store/apply.js';
import { assertNoCollision, loadExistingKeys } from './store/existing.js';
import { loadTarget, singletonPlan, type DemoTarget } from './store/target.js';

export interface RunOptions {
  readonly db: Db;
  readonly files: Pick<FileStorage, 'put'>;
  /** Slug or id of the one organization to fill. */
  readonly organization: string;
  /** False: print the plan and write nothing. */
  readonly apply: boolean;
  readonly log: (line: string) => void;
  readonly now?: Date;
  readonly secret?: () => string;
}

export type RunOutcome = 'applied' | 'dry_run' | 'nothing_to_do';

export interface RunResult {
  readonly outcome: RunOutcome;
  readonly organizationId: string;
  readonly plan: SeedPlan;
}

/** The hash of a fresh random token: link secrets of the demo are as unguessable as real ones, and nobody holds them. */
const randomTokenHash = (): string => createHash('sha256').update(randomBytes(32)).digest('hex');

const contextFor = (target: DemoTarget, now: Date, secret: () => string): DemoContext => ({
  organizationId: target.organization.id,
  owner: target.owner,
  notice: target.notice ?? { id: demoId(target.organization.id, 'privacy-notice'), version: 1, retentionDays: demoNoticeInput(target.owner.email).retentionDays },
  now,
  secret,
});

/**
 * Fills one organization with the demo: reads where it stands, plans only what is missing, prints the plan, and writes
 * it (CVs first, then every row in one transaction) only when `apply` is set.
 */
export async function runDemoSeed(options: RunOptions): Promise<RunResult> {
  const { db, log } = options;
  const target = await loadTarget(db, options.organization);
  const ctx = contextFor(target, options.now ?? new Date(), options.secret ?? randomTokenHash);
  const dataset = await buildDemoDataset(ctx);
  await assertNoCollision(db, ctx.organizationId, dataset);
  const plan = planSeed(dataset, await loadExistingKeys(db, ctx.organizationId, dataset), singletonPlan(target, dataset.careersPage));
  describePlan(plan, target.organization).forEach((line) => log(line));
  const result = (outcome: RunOutcome): RunResult => ({ outcome, organizationId: ctx.organizationId, plan });
  if (isNoop(plan)) {
    log('Nothing to do: the demo is already there.');
    return result('nothing_to_do');
  }
  if (!options.apply) {
    log('Dry run: nothing was written. Run it again with --yes (or DEMO_SEED=1) to write it.');
    return result('dry_run');
  }
  for (const file of plan.cvFiles) await options.files.put(file.key, file.bytes, 'application/pdf');
  await applyPlan(db, ctx, plan, target, dataset.careersPage, auditEventsFor(plan, ctx.organizationId, ctx.notice.id));
  log(`Done: the demo is in "${target.organization.name}". Rerunning it adds only what is missing.`);
  return result('applied');
}
