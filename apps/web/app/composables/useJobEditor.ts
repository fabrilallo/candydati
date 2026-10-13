import type { JobDto, JobTemplateDto } from '@tt/domain'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { closeJob, createJob, createTemplate, publishJob, updateJob } from '@/lib/job-api'
import { contentToForm, emptyForm, snapshotOf, validateForm } from '@/lib/job-form'
import { can } from '@/lib/permissions-ui'
import { needsConfirmation } from '@/lib/quality-view'
import { visibleIssueErrors } from '@/lib/ad-gaps'

export interface EditorInit {
  readonly job: JobDto | null
  readonly template: JobTemplateDto | null
}

type Busy = 'save' | 'publish' | 'close' | 'template' | null

const startingForm = (init: EditorInit, language: string) =>
  init.job ? contentToForm(init.job.content) : init.template ? contentToForm(init.template.content) : emptyForm(language)

/**
 * Everything the editor does against the api, in one place: save (create or update), analyse, publish (save if
 * dirty -> analyse -> confirm when below threshold -> publish), close, save as template. Screens only bind to it.
 */
export const useJobEditor = (init: EditorInit) => {
  const { t, locale } = useI18n()
  const api = useJobsApi()
  const { viewer } = useViewer()
  const role = computed(() => viewer.value?.role ?? null)
  const draft = useJobDraft(startingForm(init, locale.value))
  const quality = useJobQuality(api, () => snapshotOf(draft.form.value))
  const job = ref<JobDto | null>(init.job)
  const busy = ref<Busy>(null)
  const errorKey = ref<string | null>(null)
  const attempted = ref(false)
  const confirmOpen = ref(false)
  const isNew = init.job === null

  const status = computed(() => job.value?.status ?? 'draft')
  const readOnly = computed(() => status.value === 'closed' || !can(role.value, job.value ? 'job:update' : 'job:create'))
  const permissions = computed(() => ({
    publish: can(role.value, 'job:publish') && !readOnly.value,
    close: can(role.value, 'job:close') && status.value === 'published',
    template: can(role.value, 'job_template:create'),
  }))
  const fieldErrors = computed(() => (attempted.value ? draft.check.value.errors : {}))
  /** Controls the user has left: their publish rules start to show (a fresh draft is not a wall of red). */
  const touched = ref<ReadonlySet<string>>(new Set())
  /** The user asked what is missing: every publish rule shows on its field. */
  const revealed = ref(false)
  const touch = (ids: readonly string[]): void => {
    if (ids.every((id) => touched.value.has(id))) return
    touched.value = new Set([...touched.value, ...ids])
  }
  const reveal = (): void => {
    revealed.value = true
  }
  /** Validation problems win over publish rules on the same field. */
  const errors = computed(() => ({ ...visibleIssueErrors({ issues: draft.check.value.issues, touched: touched.value, attempted: revealed.value }), ...fieldErrors.value }))
  /** Shared across the navigation from `/app/jobs/new` to the saved ad, so the confirmation survives it. */
  const justPublished = useState<string | null>('job-just-published', () => null)
  const publishedOpen = computed(() => job.value !== null && justPublished.value === job.value.id)
  const dismissPublished = (): void => {
    justPublished.value = null
  }

  const setKey = (key: string): false => {
    errorKey.value = key
    return false
  }
  const fail = (error: unknown): false => {
    errorKey.value = errorKeyOf(error)
    return false
  }
  /** A job created on the "new" page continues at its own address. */
  const goToSaved = async (): Promise<void> => {
    if (isNew && job.value) await navigateTo(`/app/jobs/${job.value.id}`, { replace: true })
  }

  const save = async (options: { navigate: boolean } = { navigate: true }): Promise<boolean> => {
    attempted.value = true
    errorKey.value = null
    const sent = draft.form.value
    const { content } = validateForm(sent)
    if (!content) return setKey('job.actions.cannotSave')
    busy.value = 'save'
    try {
      const current = job.value
      const created = current === null
      job.value = created ? await createJob(api, content, init.template?.id) : await updateJob(api, current.id, content)
      draft.markSaved(sent)
      toast.success(t(created ? 'job.actions.created' : 'job.actions.saved'))
      if (options.navigate) await goToSaved()
      return true
    } catch (error) {
      return fail(error)
    } finally {
      busy.value = null
    }
  }

  const analyze = async (): Promise<void> => {
    const { content } = validateForm(draft.form.value)
    attempted.value = true
    if (!content) {
      setKey('job.quality.needsTitle')
      return
    }
    errorKey.value = null
    await quality.analyze(content, snapshotOf(draft.form.value))
  }

  const finishPublish = async (): Promise<void> => {
    if (!job.value) return
    busy.value = 'publish'
    try {
      const result = await publishJob(api, job.value.id)
      job.value = result.job
      if (result.job.status === 'published') justPublished.value = result.job.id
      if (result.quality) quality.set(result.quality, snapshotOf(draft.form.value))
      toast.success(t('job.publish.published'))
      if (!result.quality) toast.message(t('job.publish.noAnalysis'))
      await goToSaved()
    } catch (error) {
      fail(error)
    } finally {
      busy.value = null
    }
  }

  const publish = async (): Promise<void> => {
    if (!draft.check.value.publishable || !permissions.value.publish) return
    if ((job.value === null || draft.dirty.value) && !(await save({ navigate: false }))) return
    const { content } = validateForm(draft.form.value)
    busy.value = 'publish'
    const assessment = content ? await quality.analyze(content, snapshotOf(draft.form.value)) : null
    busy.value = null
    if (needsConfirmation(assessment)) {
      confirmOpen.value = true
      return
    }
    await finishPublish()
  }

  const confirmPublish = async (): Promise<void> => {
    confirmOpen.value = false
    await finishPublish()
  }
  const cancelPublish = async (): Promise<void> => {
    confirmOpen.value = false
    await goToSaved()
  }

  const close = async (): Promise<boolean> => {
    if (!job.value || !permissions.value.close) return false
    busy.value = 'close'
    errorKey.value = null
    try {
      job.value = await closeJob(api, job.value.id)
      toast.success(t('job.actions.closed'))
      return true
    } catch (error) {
      return fail(error)
    } finally {
      busy.value = null
    }
  }

  const saveTemplate = async (name: string): Promise<boolean> => {
    const { content } = validateForm(draft.form.value)
    if (!content) return setKey('job.actions.cannotSave')
    busy.value = 'template'
    errorKey.value = null
    try {
      await createTemplate(api, name, content)
      toast.success(t('job.actions.templateSaved'))
      return true
    } catch (error) {
      return fail(error)
    } finally {
      busy.value = null
    }
  }

  useUnsavedGuard(draft.dirty)

  return {
    ...draft,
    job,
    status,
    readOnly,
    permissions,
    busy,
    errorKey,
    fieldErrors,
    errors,
    touch,
    reveal,
    revealed,
    publishedOpen,
    dismissPublished,
    confirmOpen,
    quality,
    save,
    analyze,
    publish,
    confirmPublish,
    cancelPublish,
    close,
    saveTemplate,
  }
}
