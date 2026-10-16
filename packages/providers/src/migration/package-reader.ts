import type { FileStorage, MigrationPackageReader } from '@candydati/core';
import { MigrationPackageError, openMigrationPackage, type OpenMigrationPackageOptions } from './package-archive.js';

/**
 * The core's `MigrationPackageReader` over file storage: streams the stored ZIP into `openMigrationPackage` (capped) and
 * turns a refused package into a stable code for the batch. Storage or unexpected errors are thrown, for the queue to retry.
 */
export function createMigrationPackageReader(files: Pick<FileStorage, 'getStream'>, options: OpenMigrationPackageOptions = {}): MigrationPackageReader {
  return {
    async open(key) {
      const { stream } = await files.getStream(key);
      try {
        return { ok: true, package: await openMigrationPackage(stream, options) };
      } catch (error) {
        if (error instanceof MigrationPackageError) return { ok: false, code: error.code, details: error.details };
        throw error;
      }
    },
  };
}
