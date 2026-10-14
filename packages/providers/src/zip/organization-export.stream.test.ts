import { randomBytes } from 'node:crypto';
import { buildOrganizationExport, requestOrganizationExport } from '@tt/core';
import { buildApplication, buildCandidate, ORG_A, seedPrivacyData, userActor } from '@tt/core/testing';
import { describe, expect, it } from 'vitest';
import { zipStreamFactory } from './zip-stream.js';

const CANDIDATES = 2000;
const CV_BYTES = 100 * 1024;
const MB = 1024 * 1024;

describe('organization export of a large organization', () => {
  it('streams 2000 candidates with CVs to storage with bounded memory', async () => {
    const deps = await seedPrivacyData();
    for (let i = 0; i < CANDIDATES; i += 1) {
      const id = `bulk_${String(i).padStart(5, '0')}`;
      await deps.candidates.create(buildCandidate({ id, organizationId: ORG_A, email: `${id}@example.org` }));
      await deps.applications.create(
        buildApplication({ id: `app_${id}`, candidateId: id, organizationId: ORG_A, cv: { key: `cv/${id}`, fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: CV_BYTES } }),
      );
    }

    // CVs are generated on read and the archive is counted and dropped: neither side keeps the data around.
    let written = 0;
    let peak = 0;
    let archiveHead = new Uint8Array(0);
    const baseline = () => process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
    const start = baseline();
    const streaming = {
      ...deps,
      zip: zipStreamFactory,
      files: {
        ...deps.files,
        get: async (key: string) => (key.startsWith('cv/') ? randomBytes(CV_BYTES) : deps.files.get(key)),
        putStream: async (_key: string, source: AsyncIterable<Uint8Array>) => {
          for await (const chunk of source) {
            if (written === 0) archiveHead = chunk.slice(0, 4);
            written += chunk.byteLength;
            peak = Math.max(peak, baseline() - start);
          }
          return written;
        },
      },
    };
    const created = await requestOrganizationExport(streaming, userActor({ role: 'admin', organizationId: ORG_A }), {});
    const done = await buildOrganizationExport(streaming, { organizationId: ORG_A, exportId: created.id });

    expect(done).toMatchObject({ status: 'ready', sizeBytes: written });
    expect([...archiveHead]).toEqual([0x50, 0x4b, 0x03, 0x04]); // a ZIP local file header
    // About 200 MB of incompressible CVs went through; the process never held more than a small fraction of it.
    expect(written).toBeGreaterThan(CANDIDATES * CV_BYTES);
    expect(peak).toBeLessThan(96 * MB);
  }, 120_000);
});
