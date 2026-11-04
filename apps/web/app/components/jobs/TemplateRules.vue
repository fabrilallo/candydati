<script setup lang="ts">
import type { JobTemplateDto, TemplateAutomationRuleDto } from '@candydati/domain'
import { Trash2Icon } from '@lucide/vue'
import { deleteTemplateRule, listTemplateRules } from '@/lib/automation-api'
import { stageOptions } from '@/lib/automation-copy-view'
import { describeRule } from '@/lib/automation-view'
import { loaded } from '@/lib/job-api'
import { Button } from '@/components/ui/button'

/**
 * The automation rules kept with a template (copied in from a job's rules). A job created from the template gets a copy
 * of each, as the rules of whoever creates it. Shown only when there are some; each can be removed.
 */
const props = defineProps<{ template: JobTemplateDto }>()
const { t } = useI18n()
const request = useJobsApi()
const { data } = useFreshAsyncData(`template-rules-${props.template.id}`, () => loaded(() => listTemplateRules(request, props.template.id)))
const rules = useSyncedData<readonly TemplateAutomationRuleDto[]>(data)
const templates = useEmailTemplates()
const team = useMembers()
const stages = computed(() => stageOptions(props.template.content, t))
const names = computed(() => ({
  template: (id: string) => templates.templates.value?.find((item) => item.id === id)?.name ?? null,
  member: team.nameOf,
  stage: (id: string) => stages.value.find((stage) => stage.id === id)?.label ?? null,
  owner: t('automations.form.jobOwner'),
}))
const busy = ref<string | null>(null)
const run = useBusyRunner(busy)
const sentence = (rule: TemplateAutomationRuleDto): string => {
  const words = describeRule(rule, names.value)
  const what = t(words.key, { ...words.params }, typeof words.params.count === 'number' ? words.params.count : 1)
  const stage = names.value.stage(rule.stageId) ?? '?'
  return t('job.templates.rules.line', { stage, what })
}
const remove = async (rule: TemplateAutomationRuleDto): Promise<void> => {
  const done = await run(rule.id, () => deleteTemplateRule(request, rule.id).then(() => true), 'automations.deleted')
  if (done) rules.value = (rules.value ?? []).filter((item) => item.id !== rule.id)
}
</script>

<template>
  <details v-if="(rules ?? []).length > 0" class="group text-sm" data-testid="template-rules">
    <summary class="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">{{ t('job.templates.rules.summary', { count: rules?.length ?? 0 }, rules?.length ?? 0) }}</summary>
    <p class="mt-2 text-xs text-pretty text-muted-foreground">{{ t('job.templates.rules.note') }}</p>
    <ul class="mt-2 grid gap-1.5">
      <li v-for="rule in rules" :key="rule.id" class="flex items-start justify-between gap-2" :class="busy === rule.id ? 'opacity-60' : ''" data-testid="template-rule">
        <span class="min-w-0 text-pretty first-letter:uppercase">{{ sentence(rule) }}</span>
        <Button variant="ghost" size="icon-sm" :disabled="busy !== null" :aria-label="t('job.templates.rules.delete')" data-testid="template-rule-delete" @click="remove(rule)"><Trash2Icon aria-hidden="true" /></Button>
      </li>
    </ul>
  </details>
</template>
