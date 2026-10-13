/**
 * What the assistant knows of the page it was opened on: the route, which view it is, and the job, candidate and
 * application in sight. Read from the path and the query, plus the candidate open in a side panel (a board card
 * opens the candidate without changing the address). Pure.
 */
export type AssistantView =
  | 'dashboard'
  | 'attention'
  | 'tasks'
  | 'jobs'
  | 'job_new'
  | 'job_editor'
  | 'job_pipeline'
  | 'job_automations'
  | 'templates'
  | 'candidates'
  | 'candidate'
  | 'settings'
  | 'other'

export interface PageContext {
  readonly route: string
  readonly view: AssistantView
  readonly jobId: string | null
  readonly candidateId: string | null
  readonly applicationId: string | null
}

export interface FocusedCandidate {
  readonly applicationId: string | null
  readonly candidateId: string | null
}

export interface RouteLike {
  readonly path: string
  readonly query: Readonly<Record<string, unknown>>
}

const STATIC: Readonly<Record<string, AssistantView>> = {
  '/app': 'dashboard',
  '/app/attention': 'attention',
  '/app/tasks': 'tasks',
  '/app/jobs': 'jobs',
  '/app/jobs/new': 'job_new',
  '/app/jobs/templates': 'templates',
  '/app/candidates': 'candidates',
}

const JOB_TABS: Readonly<Record<string, AssistantView>> = { '': 'job_editor', candidates: 'job_pipeline', automations: 'job_automations' }

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const viewOf = (path: string): { view: AssistantView; jobId: string | null; candidateId: string | null } => {
  const fixed = STATIC[path]
  if (fixed) return { view: fixed, jobId: null, candidateId: null }
  const job = /^\/app\/jobs\/([^/]+)(?:\/([^/]+))?$/.exec(path)
  const tab = job ? JOB_TABS[job[2] ?? ''] : undefined
  if (job?.[1] && tab) return { view: tab, jobId: decode(job[1]), candidateId: null }
  const candidate = /^\/app\/candidates\/([^/]+)$/.exec(path)
  if (candidate?.[1]) return { view: 'candidate', jobId: null, candidateId: decode(candidate[1]) }
  return { view: path.startsWith('/app/settings/') ? 'settings' : 'other', jobId: null, candidateId: null }
}

export const pageContextOf = (route: RouteLike, focus: FocusedCandidate): PageContext => {
  const path = route.path.length > 1 ? route.path.replace(/\/+$/, '') : route.path
  const { view, jobId, candidateId } = viewOf(path)
  const fromQuery = typeof route.query.application === 'string' ? route.query.application : null
  return {
    route: route.path,
    view,
    jobId,
    candidateId: focus.candidateId ?? candidateId,
    applicationId: focus.applicationId ?? (view === 'candidate' ? fromQuery : null),
  }
}

/** The page as sent with each message: ids only when there are some. */
export const toWirePage = (context: PageContext): Record<string, string> =>
  Object.fromEntries(Object.entries(context).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

export type SuggestionKey = 'today' | 'writeAd' | 'improveAd' | 'checkAd' | 'pipeline' | 'reply' | 'summary'

/** Starting points for an empty conversation, relevant to the page (translated under `assistant.suggestions`). */
export const suggestionKeys = (context: PageContext): readonly SuggestionKey[] => {
  if (context.applicationId) return ['reply', 'summary', 'today']
  if (context.view === 'job_editor') return ['improveAd', 'checkAd', 'today']
  if (context.view === 'job_pipeline') return ['pipeline', 'today']
  if (context.view === 'job_new' || context.view === 'jobs' || context.view === 'templates') return ['writeAd', 'today']
  return ['today', 'writeAd']
}

export interface ShortcutEventLike {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** Cmd+J on Apple devices, Ctrl+J elsewhere: opens and closes the assistant from anywhere in the app. */
export const isAssistantShortcut = (event: ShortcutEventLike): boolean =>
  event.key.toLowerCase() === 'j' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey

export const shortcutLabel = (platform: string): string => (/mac|iphone|ipad|ipod/i.test(platform) ? '⌘J' : 'Ctrl J')
