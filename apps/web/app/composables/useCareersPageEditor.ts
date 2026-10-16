import type { CareersPageEditorDto, Locale, PublicCareersDto } from '@candydati/domain'
import type { Ref } from 'vue'
import { getCareersPageEditor } from '@/lib/careers-page-api'
import type { EditorDocument } from '@/lib/careers-editor'
import { editorIssues, NO_ISSUES } from '@/lib/careers-editor-issues'
import { mediaMap } from '@/lib/careers-media-view'
import { fetchCareers, loaded } from '@/lib/job-api'

/**
 * State of the careers page editor: the draft being edited (a local copy, compared with what was last saved), its
 * validation with the api's schema, the media library and the open positions shown by the live preview.
 */
export const useCareersPageEditor = () => {
  const request = useJobsApi()
  const { data, refresh } = useAsyncData('careers-page-editor', () => loaded(() => getCareersPageEditor(request)))
  const editor = ref<CareersPageEditorDto | null>(null)
  const draft = ref<EditorDocument | null>(null)
  const savedJson = ref('')
  const editingLocale = ref<Locale>('it')

  const adopt = (fresh: CareersPageEditorDto | null | undefined): void => {
    if (!fresh) return
    editor.value = fresh
    draft.value = fresh.draft
    savedJson.value = JSON.stringify(fresh.draft)
    editingLocale.value = fresh.draft.defaultLocale
  }
  watch(() => data.value?.data, adopt, { immediate: true })

  const dirty = computed(() => draft.value !== null && JSON.stringify(draft.value) !== savedJson.value)
  const issues = computed(() => (draft.value ? editorIssues(draft.value) : NO_ISSUES))
  const library = useCareersMediaLibrary(request)
  const persist = useCareersPageSave({ request, draft, editor, savedJson, dirty, issues })
  const careers = useCareersPreviewJobs(computed(() => editor.value?.organization ?? null))

  /** Every change to the draft goes through here, as a pure function of the current document. */
  const edit = (change: (document: EditorDocument) => EditorDocument): void => {
    if (draft.value) draft.value = change(draft.value)
  }

  return {
    editor: computed(() => editor.value),
    draft: computed(() => draft.value),
    loadErrorKey: computed(() => data.value?.errorKey ?? null),
    refresh,
    dirty,
    issues,
    editingLocale,
    library,
    media: computed(() => mediaMap(library.assets.value)),
    careers,
    edit,
    busy: persist.busy,
    errorKey: persist.errorKey,
    stale: persist.stale,
    /** Drops the local changes for the version someone else saved (after a `stale_revision` refusal). */
    reload: async (): Promise<void> => {
      await refresh()
      adopt(data.value?.data)
      persist.clearStale()
    },
    save: persist.save,
    publish: persist.publish,
  }
}

export type CareersPageEditor = ReturnType<typeof useCareersPageEditor>

/** The organization's open positions, as the public page lists them (empty while loading or when unreachable). */
const useCareersPreviewJobs = (organization: Ref<CareersPageEditorDto['organization'] | null>) => {
  const request = useJobsApi()
  const slug = computed(() => organization.value?.slug ?? '')
  const { data } = useAsyncData('careers-page-preview-jobs', () => (slug.value ? loaded(() => fetchCareers(request, slug.value)) : Promise.resolve(null)), { watch: [slug] })
  return computed<PublicCareersDto>(() => data.value?.data ?? { organization: organization.value ?? { name: '', slug: '', logo: null }, jobs: [] })
}
