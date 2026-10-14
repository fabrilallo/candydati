/** A row whose background task may be missing: its organization and id. */
export interface StuckRow {
  readonly organizationId: string;
  readonly id: string;
}

/**
 * Work stored as waiting for a task that may never have been queued (a crash between a commit and the send, a queue
 * outage). Across organizations, oldest first, at most `limit` rows: only for the reconciler, a system job.
 */
export interface StuckWorkRepository {
  /** Outbound messages still `queued` that were created before `before`. */
  queuedMessages(before: Date, limit: number): Promise<readonly StuckRow[]>;
  /** Organization exports still `pending` that were requested before `before`. */
  pendingExports(before: Date, limit: number): Promise<readonly StuckRow[]>;
  /** Import batches created before `before` and still waiting for their analysis (`uploaded`) or commit (`importing`). */
  unfinishedImports(before: Date, limit: number): Promise<readonly (StuckRow & { readonly status: 'uploaded' | 'importing' })[]>;
}
