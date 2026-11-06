import { toast } from 'vue-sonner'
import type { AutomationPackDto, AutomationPackInput } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { createPack, deletePack, listPacks, updatePack } from '@/lib/automation-pack-api'
import { loaded } from '@/lib/job-api'

/** The automation packs of the organization: list, create, rename and delete (`automation:manage`). */
export const useAutomationPacks = () => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('automation-packs', () => loaded(() => listPacks(request)))
  const packs = useSyncedData<readonly AutomationPackDto[]>(data)
  const busy = ref<string | null>(null)
  const saveErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  /** Creates (no pack) or renames a pack; the error stays in `saveErrorKey` for the dialog. Returns the saved pack. */
  const save = async (pack: AutomationPackDto | null, input: AutomationPackInput): Promise<AutomationPackDto | null> => {
    busy.value = pack?.id ?? 'new'
    saveErrorKey.value = null
    try {
      const fresh = pack ? await updatePack(request, pack.id, input) : await createPack(request, input)
      const list = packs.value ?? []
      packs.value = pack ? list.map((item) => (item.id === fresh.id ? { ...fresh, ruleCount: item.ruleCount, templateIds: item.templateIds } : item)) : [...list, fresh]
      toast.success(t('automationPacks.saved'))
      return fresh
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return null
    } finally {
      busy.value = null
    }
  }

  const remove = async (pack: AutomationPackDto): Promise<boolean> => {
    const done = await run(pack.id, () => deletePack(request, pack.id).then(() => true), 'automationPacks.deleted')
    if (done) packs.value = (packs.value ?? []).filter((item) => item.id !== pack.id)
    return done === true
  }

  return {
    packs: computed(() => packs.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    saveErrorKey: computed(() => saveErrorKey.value),
    clearError: () => {
      saveErrorKey.value = null
    },
    refresh,
    save,
    remove,
  }
}
