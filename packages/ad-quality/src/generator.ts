import type { z } from 'zod';

export interface StructuredRequest {
  readonly system: string;
  readonly prompt: string;
  /** The shape the answer must have; the caller validates it again, so the implementation may be lenient. */
  readonly schema: z.ZodType;
}

/** Port to a language model that answers with structured data. The api implements it with Mastra. */
export type StructuredGenerator = (request: StructuredRequest) => Promise<unknown>;
