import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { attempt } from '@/lib/load-result'
import { getRestrictedStages, setStageRestriction, type RestrictedStagesDto } from '@/lib/restricted-stages-api'

/**
 * The restricted stages of a job (PRODUCT.md §6.2), shown in its Team tab. Each switch saves at once; the screen shows
 * what the api answered. Whether the viewer may change them comes from the api (owners, admins, the hiring manager).
 */
export const useRestrictedStages = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`restricted-stages-${jobId}`, () => attempt(() => getRestrictedStages(request, jobId)))
  const local = ref<RestrictedStagesDto | null>(null)
  const current = computed(() => local.value ?? data.value?.data ?? null)
  const busy = ref<string | null>(null)

  const toggle = async (stageId: string, restricted: boolean): Promise<boolean> => {
    busy.value = stageId
    try {
      local.value = await setStageRestriction(request, jobId, stageId, restricted)
      toast.success(t(restricted ? 'jobTeam.restricted.marked' : 'jobTeam.restricted.cleared'))
      return true
    } catch (error) {
      toast.error(t('jobTeam.restricted.saveFailed'), { description: t(errorKeyOf(error)) })
      return false
    } finally {
      busy.value = null
    }
  }

  return {
    stageIds: computed<readonly string[]>(() => current.value?.stageIds ?? []),
    canManage: computed(() => current.value?.canManage ?? false),
    loaded: computed(() => current.value !== null),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    toggle,
    refresh,
  }
}
