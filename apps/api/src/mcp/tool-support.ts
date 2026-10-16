import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Actor } from '@candydati/core';
import type { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { toHttpFailure } from '../http/errors.js';

export interface ToolContext {
  readonly app: AppContext;
  /** The API key, acting for the person who created it, limited to the key's scopes. */
  readonly actor: Actor;
}

export interface ToolDefinition<S extends z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  /** States what the tool does AND what it never does: this is the text a model reads. */
  readonly description: string;
  readonly shape: S;
  readonly readOnly: boolean;
  /** May call the model (FAST_MODEL): spends the daily model budget of the key and of the organization. */
  readonly usesModel?: boolean;
  readonly run: (context: ToolContext, input: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

export type ToolResult = CallToolResult;

export const toolOk = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });

export const toolError = (text: string): ToolResult => ({ isError: true, content: [{ type: 'text', text }] });

/**
 * Core errors become tool errors with the same safe message the REST API gives (validation messages already name the
 * fields, so the model can fix its input). Anything unexpected is reported by the caller and shown only generically.
 */
export function failureOf(error: unknown): { readonly result: ToolResult; readonly unexpected: boolean } {
  const failure = toHttpFailure(error);
  return { result: toolError(`${failure.code}: ${failure.message}`), unexpected: failure.log };
}
