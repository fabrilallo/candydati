import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { createRule, deleteRule, listRules, updateRule, type RuleInput } from '@/lib/automation-api'
import { loaded } from '@/lib/job-api'
import type { AutomationRuleDto } from '@candydati/domain'

/** The automation rules of one job: list, add, edit, pause and delete (`automation:manage`). */
export const useAutomations = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`automations-${jobId}`, () => loaded(() => listRules(request, jobId)))
  const rules = useSyncedData<readonly AutomationRuleDto[]>(data)
  const busy = ref<string | null>(null)
  const saveErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  const upsert = (fresh: AutomationRuleDto): void => {
    const list = rules.value ?? []
    rules.value = list.some((rule) => rule.id === fresh.id) ? list.map((rule) => (rule.id === fresh.id ? fresh : rule)) : [...list, fresh]
  }

  /** Creates (no rule) or replaces a rule; the error stays in `saveErrorKey` for the dialog. */
  const save = async (rule: AutomationRuleDto | null, input: RuleInput): Promise<boolean> => {
    busy.value = rule?.id ?? 'new'
    saveErrorKey.value = null
    try {
      upsert(rule ? await updateRule(request, rule.id, input) : await createRule(request, jobId, input))
      toast.success(t('automations.saved'))
      return true
    } catch (error) {
      saveErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  const setEnabled = async (rule: AutomationRuleDto, enabled: boolean): Promise<void> => {
    const fresh = await run(rule.id, () => updateRule(request, rule.id, { stageId: rule.stageId, enabled, action: rule.action }), null)
    if (fresh) upsert(fresh)
  }

  const remove = async (rule: AutomationRuleDto): Promise<boolean> => {
    const done = await run(rule.id, () => deleteRule(request, rule.id).then(() => true), 'automations.deleted')
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
