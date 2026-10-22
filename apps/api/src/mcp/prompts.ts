import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { answerInboxPrompt, findCandidatesPrompt, weeklyReportPrompt } from './prompts-candidates.js';
import { interviewKitPrompt, writeJobAdPrompt } from './prompts-jobs.js';
import type { PromptDefinition } from './prompt-support.js';

/** Every workflow the server offers. Each one names only tools in `TOOLS` (server.ts): the test checks it. */
export const MCP_PROMPTS: readonly PromptDefinition<z.ZodRawShape>[] = [
  writeJobAdPrompt,
  answerInboxPrompt,
  findCandidatesPrompt,
  weeklyReportPrompt,
  interviewKitPrompt,
] as readonly PromptDefinition<z.ZodRawShape>[];

export const MCP_PROMPT_NAMES: readonly string[] = MCP_PROMPTS.map((prompt) => prompt.name);

/** The SDK validates the arguments against `shape` and refuses invalid ones before the text is built. */
export function registerPrompts(server: McpServer, clock: () => Date = () => new Date()): void {
  for (const prompt of MCP_PROMPTS) {
    const build = (args: z.infer<z.ZodObject<z.ZodRawShape>>): GetPromptResult => ({
      description: prompt.description,
      messages: [{ role: 'user', content: { type: 'text', text: prompt.text(args, clock()) } }],
    });
    server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description, argsSchema: prompt.shape }, build as never);
  }
}
