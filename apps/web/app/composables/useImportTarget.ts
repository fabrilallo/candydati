import type { StageRef } from '@tt/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { getPipeline } from '@/lib/candidate-api'

/** The job an import goes to and the stage of its pipeline where the candidates start. */
export const useImportTarget = (request: ReturnType<typeof useJobsApi>, errorKey: Ref<string | null>) => {
  const jobId = ref('')
  const stageId = ref('')
  const stages = ref<readonly StageRef[]>([])
  const stagesLoading = ref(false)

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

  return { jobId, stageId, stages, stagesLoading }
}
