import { MIGRATION_LIMITS } from '@candydati/domain';
import { JsonReaderError } from '../../../http/index.js';
import type { BuilderFile } from '../../package-builder.js';
import { isRefusal, type Run } from './run.js';

/** Files added so far per application (the package caps them). */
export type FileCounts = Map<string, number>;

/**
 * Starts the download of one file right after its record was read (signed URLs live 30 s to 1 minute) and attaches it to an
 * application. A file that cannot be had (expired link, private address, too large, refused) is left out and counted:
 * one bad file never stops the migration. Credentials are never sent to the signed URL.
 */
export async function storeFile(run: Run, counts: FileCounts, applicationRef: string, file: BuilderFile, url: string): Promise<void> {
  const used = counts.get(applicationRef) ?? 0;
  if (used >= MIGRATION_LIMITS.filesPerApplication) {
    run.report.filesSkipped += 1;
    return;
  }
  // The slot is taken now, so files queued in the background cannot overshoot the cap; a failed one gives it back.
  counts.set(applicationRef, used + 1);
  await run.downloads.submit(async () => {
    try {
      await run.builder.addFile(applicationRef, file, (store) => run.client.download(url, store));
      run.report.files += 1;
    } catch (error) {
      if (!(error instanceof JsonReaderError) && !isRefusal(error)) throw error;
      counts.set(applicationRef, (counts.get(applicationRef) ?? 1) - 1);
      run.report.filesSkipped += 1;
    }
    await run.tick(0);
  });
}
