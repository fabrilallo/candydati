import { MAX_WEB_RESULTS, WEB_QUERY_MAX } from '@candydati/domain'
import { z } from 'zod'

/** What a browser tool gives the model back: the sealed results, or an error code it explains. */
export type BrowserToolOutput = Readonly<Record<string, unknown>>

/** The side of the assistant bridge that talks to the extension (`useLinkedinBridge`). */
export interface BrowserToolRunner {
  run(input: never): Promise<BrowserToolOutput>
  runWeb(input: { readonly jobId: string; readonly query: string; readonly limit: number }): Promise<BrowserToolOutput>
}

const webInputSchema = z.object({
  jobId: z.string().min(1).max(100),
  query: z.string().trim().min(1).max(WEB_QUERY_MAX),
  limit: z.number().int().min(1).max(MAX_WEB_RESULTS).default(10),
})

const BROWSER_TOOLS = {
  search_linkedin_people: (runner: BrowserToolRunner, input: unknown) => runner.run(input as never),
  search_web_people: async (runner: BrowserToolRunner, input: unknown): Promise<BrowserToolOutput> => {
    const parsed = webInputSchema.safeParse(input)
    return parsed.success ? runner.runWeb(parsed.data) : { error: { code: 'failed' } }
  },
} as const

export type BrowserTool = keyof typeof BROWSER_TOOLS
export const isBrowserTool = (name: string): name is BrowserTool => Object.hasOwn(BROWSER_TOOLS, name)

/**
 * Runs a tool the browser runs (LinkedIn and Google, through the extension) and hands its output to `done`; any other
 * tool is left to the server. Not awaited by the caller: the SDK waits for the output, awaiting would deadlock.
 */
export const runInBrowser = (runner: BrowserToolRunner | null, toolCall: { readonly toolName: string; readonly input: unknown }, done: (tool: BrowserTool, output: unknown) => void): void => {
  const tool = toolCall.toolName
  if (!runner || !isBrowserTool(tool)) return
  void BROWSER_TOOLS[tool](runner, toolCall.input).then((output) => done(tool, output))
}
