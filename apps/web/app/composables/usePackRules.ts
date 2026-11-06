import { toast } from 'vue-sonner'
import type { AutomationPackRuleDto, AutomationPackRuleInput } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { createPackRule, deletePackRule, listPackRules, updatePackRule } from '@/lib/automation-pack-api'
import { loaded } from '@/lib/job-api'

/** The rules of one automation pack: list, add, edit, pause and delete. */
export const usePackRules = (packId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`automation-pack-rules-${packId}`, () => loaded(() => listPackRules(request, packId)))
  const rules = useSyncedData<readonly AutomationPackRuleDto[]>(data)
  const busy = ref<string | null>(null)
  const saveErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  const upsert = (fresh: AutomationPackRuleDto): void => {
    const list = rules.value ?? []
    rules.value = list.some((rule) => rule.id === fresh.id) ? list.map((rule) => (rule.id === fresh.id ? fresh : rule)) : [...list, fresh]
  }

  const save = async (rule: AutomationPackRuleDto | null, input: AutomationPackRuleInput): Promise<boolean> => {
    busy.value = rule?.id ?? 'new'
    saveErrorKey.value = null
    try {
      upsert(rule ? await updatePackRule(request, rule.id, input) : await createPackRule(request, packId, input))
      toast.success(t('automations.saved'))
      return true
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  const setEnabled = async (rule: AutomationPackRuleDto, enabled: boolean): Promise<void> => {
    const input = { stage: rule.stage, trigger: rule.trigger, conditions: rule.conditions, enabled, action: rule.action }
    const fresh = await run(rule.id, () => updatePackRule(request, rule.id, input), null)
    if (fresh) upsert(fresh)
  }

  const remove = async (rule: AutomationPackRuleDto): Promise<boolean> => {
    const done = await run(rule.id, () => deletePackRule(request, rule.id).then(() => true), 'automations.deleted')
    if (done) rules.value = (rules.value ?? []).filter((item) => item.id !== rule.id)
    return done === true
  }

  return {
    rules: computed(() => rules.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    saveErrorKey: computed(() => saveErrorKey.value),
    clearError: () => {
      saveErrorKey.value = null
    },
    refresh,
    save,
    setEnabled,
    remove,
  }
}
