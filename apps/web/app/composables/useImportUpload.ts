import type { JobSummaryDto } from '@tt/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { getPipeline } from '@/lib/candidate-api'
import type { StageRef } from '@/lib/candidate-schemas'
import { checkImportFiles, mergeFiles, pathOf } from '@/lib/import-files'
import { uploadImport, type XhrLike } from '@/lib/import-upload'
import { listJobs, loaded } from '@/lib/job-api'
import { IMPORT_LIMITS } from '@tt/domain'

const JOBS_LIMIT = 100

type Picked = File

/** The browser's `XMLHttpRequest` through the seam (its handler types are DOM-specific, the shape is the same). */
const browserXhr = (): XhrLike => new XMLHttpRequest() as unknown as XhrLike

/**
 * Step 1 "File": the files and folders to import, the target job and its stage, the client-side limits check and
 * the upload with progress. On success the caller opens the batch.
 */
export const useImportUpload = (makeXhr: () => XhrLike = browserXhr) => {
  const request = useJobsApi()
  const { data: jobsData } = useFreshAsyncData('import-jobs', () => loaded(async () => (await listJobs(request, null, 1, JOBS_LIMIT)).jobs))
  const jobs = computed<readonly JobSummaryDto[]>(() => (jobsData.value?.data ?? []).filter((job) => job.status !== 'closed'))
  const jobsErrorKey = computed(() => jobsData.value?.errorKey ?? null)

  const files = ref<readonly Picked[]>([])
  const check = computed(() => checkImportFiles(files.value, IMPORT_LIMITS))
  const jobId = ref('')
  const stageId = ref('')
  const stages = ref<readonly StageRef[]>([])
  const stagesLoading = ref(false)
  const progress = ref<number | null>(null)
  const errorKey = ref<string | null>(null)
  let cancelUpload: (() => void) | null = null

  watch(jobId, async (id) => {
    stages.value = []
    stageId.value = ''
    if (!id) return
    stagesLoading.value = true
    try {
      const pipeline = await getPipeline(request, id)
      if (jobId.value !== id) return
      stages.value = pipeline.stages.map(({ id: stage, declared }) => ({ id: stage, declared }))
      stageId.value = stages.value[0]?.id ?? ''
    } catch (error) {
      errorKey.value = errorKeyOf(error)
    } finally {
      stagesLoading.value = false
    }
  })

  const add = (added: readonly Picked[]): void => {
    errorKey.value = null
    files.value = mergeFiles(files.value, added)
  }
  const remove = (path: string): void => {
    files.value = files.value.filter((file) => pathOf(file) !== path)
  }
  const clear = (): void => {
    files.value = []
  }

  const ready = computed(() => check.value.ok && jobId.value !== '' && stageId.value !== '' && progress.value === null)

  const upload = async (): Promise<string | null> => {
    if (!ready.value) return null
    errorKey.value = null
    progress.value = 0
    const run = uploadImport({ files: check.value.accepted, jobId: jobId.value, stageId: stageId.value }, (value) => (progress.value = value), makeXhr)
    cancelUpload = run.cancel
    try {
      return (await run.done).id
    } catch (error) {
      errorKey.value = errorKeyOf(error)
      return null
    } finally {
      cancelUpload = null
      progress.value = null
    }
  }

  onBeforeUnmount(() => cancelUpload?.())

  return {
    jobs,
    jobsErrorKey,
    jobId,
    stageId,
    stages: computed(() => stages.value),
    stagesLoading: computed(() => stagesLoading.value),
    files: computed(() => files.value),
    check,
    progress: computed(() => progress.value),
    errorKey: computed(() => errorKey.value),
    ready,
    add,
    remove,
    clear,
    upload,
    cancel: (): void => cancelUpload?.(),
  }
}
