import type { JobDto, JobTemplateDto, Role } from '@candydati/domain'
import { AppError, errorKeyOf } from '@/lib/auth-errors'
import { contentToForm, emptyForm, snapshotOf } from '@/lib/job-form'
import { blockedStageIds } from '@/lib/job-issues'
import { can } from '@/lib/permissions-ui'

export interface EditorInit {
  readonly job: JobDto | null
  readonly template: JobTemplateDto | null
}

export type EditorBusy = 'save' | 'publish' | 'close' | 'template' | null

const startingForm = (init: EditorInit, language: string) =>
  init.job ? contentToForm(init.job.content) : init.template ? contentToForm(init.template.content) : emptyForm(language)

/** Open candidates per stage, only for a published job and only for who can read candidates. */
const useStageCounts = (init: EditorInit, role: Ref<Role | null>) => {
  const counts = init.job?.status === 'published' && can(role.value, 'candidate:read') ? usePipelineData(init.job.id) : null
  const openCounts = computed<Readonly<Record<string, number>>>(() => Object.fromEntries((counts?.pipeline.value?.stages ?? []).map((stage) => [stage.id, stage.count])))
  onMounted(() => void counts?.refresh())
  return { counts, openCounts }
}

/** The editor's refs, derived state and error handling: the base every editor action works on. */
export const useJobEditorState = (init: EditorInit) => {
  const { t, locale } = useI18n()
  const api = useJobsApi()
  const { viewer } = useViewer()
  const role = computed(() => viewer.value?.role ?? null)
  const draft = useJobDraft(startingForm(init, locale.value))
  const quality = useJobQuality(api, () => snapshotOf(draft.form.value))
  const job = ref<JobDto | null>(init.job)
  const busy = ref<EditorBusy>(null)
  const errorKey = ref<string | null>(null)
  const attempted = ref(false)
  const confirmOpen = ref(false)
  const blockedStages = ref<ReadonlySet<string>>(new Set())
  const { counts, openCounts } = useStageCounts(init, role)

  const status = computed(() => job.value?.status ?? 'draft')
  const readOnly = computed(() => status.value === 'closed' || !can(role.value, job.value ? 'job:update' : 'job:create'))
  const permissions = computed(() => ({
    publish: can(role.value, 'job:publish') && !readOnly.value,
    close: can(role.value, 'job:close') && status.value === 'published',
    template: can(role.value, 'job_template:create'),
  }))

  const setKey = (key: string): false => {
    errorKey.value = key
    return false
  }
  const fail = (error: unknown): false => {
    const blocked = error instanceof AppError ? blockedStageIds(error.issues) : new Set<string>()
    blockedStages.value = blocked
    errorKey.value = blocked.size > 0 ? 'job.errors.stageHasOpenApplications' : errorKeyOf(error)
    if (blocked.size > 0) void counts?.refresh()
    return false
  }
  /** A job created on the "new" page continues at its own address. */
  const goToSaved = async (): Promise<void> => {
    if (init.job === null && job.value) await navigateTo(`/app/jobs/${job.value.id}`, { replace: true })
  }

  return { t, api, draft, quality, job, busy, errorKey, attempted, confirmOpen, blockedStages, counts, openCounts, status, readOnly, permissions, setKey, fail, goToSaved }
}

export type JobEditorState = ReturnType<typeof useJobEditorState>
