import { isCoreError } from '@tt/core';
import { z } from 'zod';

/** What a tool returns when the use case refused: the model reads the code and explains it, the chat keeps going. */
export interface ToolRefusal {
  readonly error: { readonly code: string; readonly message: string };
}

export const toolRefusalSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const refusal = (code: string, message: string): ToolRefusal => ({ error: { code, message } });

/**
 * Runs the body and turns refusals of the core (forbidden, not found, validation, conflict) into a result instead of an
 * exception. Unknown errors propagate: they are bugs, not answers.
 */
export async function runTool<T>(body: () => Promise<T>): Promise<T | ToolRefusal> {
  try {
    return await body();
  } catch (error) {
    if (isCoreError(error)) return refusal(error.code, error.message);
    throw error;
  }
}
