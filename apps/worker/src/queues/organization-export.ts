import { buildOrganizationExport, type OrganizationExportDeps } from '@candydati/core';
import { z } from 'zod';
import { defineQueue, type QueueDefinition } from './definitions.js';

export const ORGANIZATION_EXPORT_QUEUE = 'organization.export';

export const organizationExportPayload = z.object({ organizationId: z.string().min(1), exportId: z.string().min(1) });

/** Builds the ZIP of one export request. A failure marks the request `failed` and is rethrown for the logs. */
export const createOrganizationExportQueue = (deps: OrganizationExportDeps): QueueDefinition<typeof organizationExportPayload> =>
  defineQueue({
    name: ORGANIZATION_EXPORT_QUEUE,
    payload: organizationExportPayload,
    handle: async ({ jobId, payload, logger }) => {
      const result = await buildOrganizationExport(deps, payload);
      logger.info({ jobId, exportId: payload.exportId, status: result.status, sizeBytes: result.sizeBytes }, 'organization export finished');
    },
  });
