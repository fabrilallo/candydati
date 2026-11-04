<script setup lang="ts">
import type { AutomationRuleDto, EmailTemplateDto } from '@candydati/domain'
import type { MemberRow } from '@/lib/auth-api'
import type { RuleInput } from '@/lib/automation-api'
import { EMPTY_RULE_FORM, ruleToForm, validateRuleForm, type RuleForm, type RuleFormErrors } from '@/lib/automation-view'
import { validateTriggerForm } from '@/lib/automation-trigger-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Add or edit one rule of a stage: when (trigger), only if (conditions), what happens (`RuleActionFields`), and a
 * read-only preview of who it would act for now.
 */
const props = defineProps<{
  open: boolean
  jobId: string
  stageLabel: string
  stageId: string
  rule: AutomationRuleDto | null
  templates: readonly EmailTemplateDto[]
  members: readonly MemberRow[]
  /** The other stages of the job, for a proposed move. */
  stages: readonly { readonly id: string; readonly label: string }[]
  busy: boolean
  errorKey: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [input: RuleInput] }>()
const { t } = useI18n()
const form = ref<RuleForm>(EMPTY_RULE_FORM)
const errors = ref<RuleFormErrors>({})
watch(
  () => [props.open, props.rule] as const,
  ([open, rule]) => {
    if (!open) return
    form.value = rule ? ruleToForm(rule) : EMPTY_RULE_FORM
    errors.value = {}
  },
  { immediate: true },
)
const patch = (change: Partial<RuleForm>): void => {
  form.value = { ...form.value, ...change }
}
/** What the preview asks about: the rule as typed, or null while its trigger or conditions are invalid. */
const match = computed(() => {
  const value = validateTriggerForm(form.value).value
  return value ? { stageId: props.stageId, ...value } : null
})
const submit = (): void => {
  const result = validateRuleForm(form.value, props.stageId, props.rule?.enabled ?? true)
  errors.value = result.errors
  if (result.input) emit('save', result.input)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-testid="rule-dialog">
      <DialogHeader>
        <DialogTitle>{{ rule ? t('automations.form.editTitle', { stage: stageLabel }) : t('automations.form.addTitle', { stage: stageLabel }) }}</DialogTitle>
        <DialogDescription>{{ t('automations.form.description') }}</DialogDescription>
      </DialogHeader>
      <form id="rule-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <RuleTriggerFields :form="form" :errors="errors" @patch="patch" />
        <RuleConditionsFields :form="form" :errors="errors" @patch="patch" />
        <RuleActionFields :form="form" :errors="errors" :templates="templates" :members="members" :stages="stages" @patch="patch" />
        <RulePreview :job-id="jobId" :rule-id="rule?.id ?? null" :match="match" />
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="rule-form" :disabled="busy" data-testid="rule-save">{{ busy ? t('automations.form.saving') : t('automations.form.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
