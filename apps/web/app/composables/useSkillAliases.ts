import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { addSkillAlias, getSkillAliases, removeSkillAlias, setBuiltInSkillAlias, type SkillAliasInput } from '@/lib/skill-alias-api'
import type { SkillAliasOverviewDto } from '@candydati/domain'

/** The organization's skill aliases and the built-in ones with their switches (`skill_alias:manage`). */
export const useSkillAliases = () => {
  const request = useJobsApi()
  const { data, refresh } = useFreshAsyncData('skill-aliases', () => loaded(() => getSkillAliases(request)))
  const overview = useSyncedData<SkillAliasOverviewDto>(data)
  const busy = ref<string | null>(null)
  const addErrorKey = ref<string | null>(null)
  const run = useBusyRunner(busy)

  const add = async (input: SkillAliasInput): Promise<boolean> => {
    busy.value = 'new'
    addErrorKey.value = null
    try {
      const created = await addSkillAlias(request, input)
      if (overview.value) overview.value = { ...overview.value, own: [...overview.value.own, created] }
      return true
    } catch (error) {
      addErrorKey.value = errorKeyOf(error)
      return false
    } finally {
      busy.value = null
    }
  }

  const remove = async (id: string): Promise<void> => {
    const done = await run(id, () => removeSkillAlias(request, id).then(() => true), 'skills.removed')
    if (done && overview.value) overview.value = { ...overview.value, own: overview.value.own.filter((alias) => alias.id !== id) }
  }

  const setBuiltIn = async (alias: string, enabled: boolean): Promise<void> => {
    const done = await run(`built-in:${alias}`, () => setBuiltInSkillAlias(request, alias, enabled).then(() => true), null)
    if (!done || !overview.value) return
    overview.value = {
      ...overview.value,
      builtIn: overview.value.builtIn.map((entry) => ({ ...entry, aliases: entry.aliases.map((item) => (item.alias === alias ? { ...item, enabled } : item)) })),
    }
  }

  return {
    overview: computed(() => overview.value),
    errorKey: computed(() => data.value?.errorKey ?? null),
    busy: computed(() => busy.value),
    addErrorKey: computed(() => addErrorKey.value),
    clearError: () => {
      addErrorKey.value = null
    },
    refresh,
    add,
    remove,
    setBuiltIn,
  }
}
