import { toast } from 'vue-sonner'
import { errorKeyOf } from '@/lib/auth-errors'
import { createRule, deleteRule, listRules, updateRule, type RuleInput } from '@/lib/automation-api'
import { loaded } from '@/lib/job-api'
import type { AutomationRuleDto } from '@/lib/phase4-contract'

/** The automation rules of one job: list, add, edit, pause and delete (`automation:manage`). */
export const useAutomations = (jobId: string) => {
  const { t } = useI18n()
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData(`automations-${jobId}`, () => loaded(() => listRules(request, jobId)))
  const rules = ref<readonly AutomationRuleDto[] | null>(data.value?.data ?? null)
  watch(data, (fresh) => {
    rules.value = fresh?.data ?? null
  })
  const busy = ref<string | null>(null)
  const saveErrorKey = ref<string | null>(null)

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
    busy.value = rule.id
    try {
      upsert(await updateRule(request, rule.id, { stageId: rule.stageId, enabled, action: rule.action }))
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
    } finally {
      busy.value = null
    }
  }

  const remove = async (rule: AutomationRuleDto): Promise<boolean> => {
    busy.value = rule.id
    try {
      await deleteRule(request, rule.id)
      rules.value = (rules.value ?? []).filter((item) => item.id !== rule.id)
      toast.success(t('automations.deleted'))
      return true
    } catch (error) {
      toast.error(t(errorKeyOf(error)))
      return false
    } finally {
      busy.value = null
    }
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
