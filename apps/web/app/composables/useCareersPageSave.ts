import type { CareersPageEditorDto } from '@tt/domain'
import type { ComputedRef, Ref } from 'vue'
import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import type { EditorDocument } from '@/lib/careers-editor'
import type { EditorIssues } from '@/lib/careers-editor-issues'
import { isStaleRevision, publishCareersPage, saveCareersPageDraft } from '@/lib/careers-page-api'
import type { JobApiRequest } from '@/lib/job-api'

/** The draft is saved this long after the last change, when it is valid. */
export const AUTOSAVE_MS = 2000

export type CareersBusy = 'save' | 'publish' | null

interface SaveContext {
  readonly request: JobApiRequest
  readonly draft: Ref<EditorDocument | null>
  readonly editor: Ref<CareersPageEditorDto | null>
  readonly savedJson: Ref<string>
  readonly dirty: ComputedRef<boolean>
  readonly issues: ComputedRef<EditorIssues>
}

/** Save (explicit or automatic) and publish of the careers page draft. */
export const useCareersPageSave = (context: SaveContext) => {
  const { t } = useI18n()
  const busy = ref<CareersBusy>(null)
  const { errorKey, stale, refused } = useSaveFailures()
  const revision = (): number => context.editor.value?.revision ?? 0

  /** One write to the api: busy while it runs, the answer adopted, a refusal reported (see `useSaveFailures`). */
  const write = async (kind: Exclude<CareersBusy, null>, call: () => Promise<CareersPageEditorDto>, silent: boolean): Promise<boolean> => {
    busy.value = kind
    errorKey.value = null
    try {
      context.editor.value = await call()
      return true
    } catch (error) {
      refused(error, silent)
      return false
    } finally {
      busy.value = null
    }
  }

  const save = async (options: { readonly silent: boolean } = { silent: false }): Promise<boolean> => {
    const sent = context.draft.value
    if (!sent || stale.value) return false
    if (context.issues.value.count > 0) {
      errorKey.value = 'careersEditor.save.invalid'
      return false
    }
    if (!(await write('save', () => saveCareersPageDraft(context.request, revision(), sent), options.silent))) return false
    // What was sent is what is stored now; edits made meanwhile stay unsaved.
    context.savedJson.value = JSON.stringify(sent)
    if (!options.silent) toast.success(t('careersEditor.save.saved'))
    return true
  }

  const publish = async (): Promise<boolean> => {
    if (context.issues.value.count > 0 || busy.value !== null || stale.value) return false
    if (context.dirty.value && !(await save({ silent: true }))) return false
    if (!(await write('publish', () => publishCareersPage(context.request, revision()), false))) return false
    toast.success(t('careersEditor.publish.done'))
    return true
  }

  useCareersAutosave(context, busy, () => save({ silent: true }))

  return {
    busy: computed(() => busy.value),
    errorKey: computed(() => errorKey.value),
    stale: computed(() => stale.value),
    /** After the person reloaded the other version. */
    clearStale: (): void => void (stale.value = false),
    save,
    publish,
  }
}

/**
 * What went wrong with the last write. A stale revision (someone else saved meanwhile) is not shown as an error toast:
 * it stops every further write until the person reloads.
 */
const useSaveFailures = () => {
  const { t } = useI18n()
  const errorKey = ref<string | null>(null)
  const stale = ref(false)
  const refused = (error: unknown, silent: boolean): void => {
    if (isStaleRevision(error)) {
      stale.value = true
      errorKey.value = null
      return
    }
    errorKey.value = errorKeyOf(error)
    if (!silent) toast.error(t(errorKey.value))
  }
  return { errorKey, stale, refused }
}

/** Saves `AUTOSAVE_MS` after the last change, only a valid draft, never while another save or publish runs. */
const useCareersAutosave = (context: SaveContext, busy: Ref<CareersBusy>, save: () => Promise<boolean>): void => {
  if (!import.meta.client) return
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const schedule = (): void => {
    clear()
    if (!context.dirty.value || context.issues.value.count > 0) return
    timer = setTimeout(() => {
      timer = null
      if (busy.value !== null) schedule()
      else if (context.dirty.value && context.issues.value.count === 0) void save()
    }, AUTOSAVE_MS)
  }
  watch(() => JSON.stringify(context.draft.value), schedule)
  onScopeDispose(clear)
}
