import { z } from 'zod';
import { jobContentSchema } from './content.js';

/** Identifier of the public, versioned schema of the job ad (PRODUCT.md §4.4). Bump the version on breaking changes. */
export const JOB_CONTENT_SCHEMA_ID = 'job-content.v1';

/**
 * JSON Schema (draft 2020-12) of the job ad content, as published in `docs/schema/job-content.v1.json`.
 * It describes the shape only: the publication rules of PRODUCT.md §4.1 are enforced by `checkPublishable`.
 */
export function jobContentJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(jobContentSchema, { io: 'input' }),
    $id: JOB_CONTENT_SCHEMA_ID,
    title: 'Job ad content (v1)',
  };
}
