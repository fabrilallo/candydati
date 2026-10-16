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
  /** Applications whose CV extraction is still `pending` since before `before` (the `id` is the application id). */
  pendingExtractions(before: Date, limit: number): Promise<readonly StuckRow[]>;
  /** Import batches created before `before` and still waiting for their analysis (`uploaded`) or commit (`importing`). */
  unfinishedImports(before: Date, limit: number): Promise<readonly (StuckRow & { readonly status: 'uploaded' | 'importing' })[]>;
  /**
   * Migration batches last changed before `before` and still waiting for their analysis (`uploaded`, `analyzing`) or
   * their commit (`importing`). The commit touches its batch with every chunk, so a long commit is never taken for stuck.
   */
  unfinishedMigrations(before: Date, limit: number): Promise<readonly (StuckRow & { readonly status: UnfinishedMigrationStatus })[]>;
  /**
   * Connector fetches (`fetching`) last changed before `before`: their worker died (a live fetch writes its progress every
   * few seconds). They cannot run again, their credentials are not to be trusted to a retry, so they are failed with
   * `fetch_interrupted` and their credentials wiped, in one statement. Returns the batches it failed, so the files an
   * operator uploaded to a file-based connector can be deleted at once.
   */
  failStalledFetches(before: Date, limit: number): Promise<readonly StuckRow[]>;
}

export type UnfinishedMigrationStatus = 'uploaded' | 'analyzing' | 'importing';
