import type { FileStorage } from '@candydati/core';
import { MIGRATION_MANIFEST_NAME, parseMigrationPackage } from '@candydati/domain';
import { createZipStream } from '../zip/zip-stream.js';
import { PackageBuilderError } from './package-builder.js';
import type { PackagePart } from './package-split.js';

/**
 * Writes one part as a package ZIP at `key`: `migration.json`, then each file read back from its temporary slot, one at a
 * time, streamed to storage while it is built. The manifest is validated first with the same schema the analysis uses,
 * so a part that would be refused is never written. `heartbeat` runs after each file (a big part takes minutes).
 * @throws PackageBuilderError `invalid_item` (paths only) when the manifest does not validate; nothing is stored then.
 */
export async function writePackagePart(files: Pick<FileStorage, 'get' | 'putStream' | 'delete'>, key: string, part: PackagePart, heartbeat: () => Promise<void>): Promise<void> {
  const parsed = parseMigrationPackage(part.manifest);
  if (!parsed.success) throw new PackageBuilderError('invalid_item', 'package', null, [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].slice(0, 20));
  const zip = createZipStream();
  const stored = files.putStream(key, zip.output, 'application/zip');
  try {
    await zip.add(MIGRATION_MANIFEST_NAME, new TextEncoder().encode(JSON.stringify(part.manifest)));
    for (const file of part.files) {
      await zip.add(file.path, await files.get(file.key));
      await heartbeat();
    }
    await zip.finish();
    await stored;
  } catch (error) {
    zip.abort(error instanceof Error ? error : new Error('zip_failed'));
    await stored.catch(() => undefined);
    await files.delete(key);
    throw error;
  }
}
