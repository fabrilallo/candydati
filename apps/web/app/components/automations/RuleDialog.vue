<script setup lang="ts">
import { AUTOMATION_ACTIONS, JOB_OWNER_ASSIGNEE, MAX_DUE_IN_DAYS, TASK_TITLE_MAX } from '@tt/domain'
import type { MemberRow } from '@/lib/auth-api'
import type { RuleInput } from '@/lib/automation-api'
import { EMPTY_RULE_FORM, ruleToForm, validateRuleForm, type RuleForm, type RuleFormErrors } from '@/lib/automation-view'
import type { EmailTemplateDto } from '@/lib/message-schemas'
import type { AutomationRuleDto } from '@/lib/phase4-contract'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/** Add or edit one rule of a stage: send a template, or create a task for the job owner or a member. */
const props = defineProps<{
  open: boolean
  stageLabel: string
  stageId: string
  rule: AutomationRuleDto | null
  templates: readonly EmailTemplateDto[]
  members: readonly MemberRow[]
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
const submit = (): void => {
  const result = validateRuleForm(form.value, props.stageId, props.rule?.enabled ?? true)
  errors.value = result.errors
  if (result.input) emit('save', result.input)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg" data-testid="rule-dialog">
      <DialogHeader>
        <DialogTitle>{{ rule ? t('automations.form.editTitle', { stage: stageLabel }) : t('automations.form.addTitle', { stage: stageLabel }) }}</DialogTitle>
        <DialogDescription>{{ t('automations.form.description') }}</DialogDescription>
      </DialogHeader>
      <form id="rule-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <FormField id="rule-action" :label="t('automations.form.action')">
          <NativeSelect id="rule-action" :model-value="form.type" data-testid="rule-action" @update:model-value="patch({ type: $event as RuleForm['type'] })">
            <option v-for="action in AUTOMATION_ACTIONS" :key="action" :value="action">{{ t(`automations.form.actions.${action}`) }}</option>
          </NativeSelect>
        </FormField>
        <template v-if="form.type === 'send_template'">
          <FormField id="rule-template" :label="t('automations.form.template')" :error="errors.templateId" :hint="t('automations.form.sendNote')">
            <template #default="{ invalid, describedBy }">
              <NativeSelect id="rule-template" :model-value="form.templateId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-template" @update:model-value="patch({ templateId: $event })">
                <option value="" disabled>{{ t('automations.form.templatePlaceholder') }}</option>
                <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
              </NativeSelect>
            </template>
          </FormField>
        </template>
        <template v-else>
          <FormField id="rule-title" :label="t('automations.form.taskTitle')" :error="errors.title">
            <template #default="{ invalid, describedBy }">
              <Input id="rule-title" :model-value="form.title" :maxlength="TASK_TITLE_MAX" :placeholder="t('tasks.fields.titlePlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-title" @update:model-value="patch({ title: String($event) })" />
            </template>
          </FormField>
          <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <FormField id="rule-assignee" :label="t('automations.form.assignee')" :error="errors.assignee">
              <NativeSelect id="rule-assignee" :model-value="form.assignee" data-testid="rule-assignee" @update:model-value="patch({ assignee: $event })">
                <option :value="JOB_OWNER_ASSIGNEE">{{ t('automations.form.jobOwner') }}</option>
                <option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.name }}</option>
              </NativeSelect>
            </FormField>
            <FormField id="rule-due" :label="t('automations.form.dueInDays')" :error="errors.dueInDays">
              <template #default="{ invalid, describedBy }">
                <Input id="rule-due" :model-value="form.dueInDays" type="number" inputmode="numeric" min="0" :max="MAX_DUE_IN_DAYS" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-due" @update:model-value="patch({ dueInDays: String($event) })" />
              </template>
            </FormField>
          </div>
          <p class="-mt-2 text-xs text-muted-foreground">{{ t('automations.form.dueInDaysHint') }}</p>
        </template>
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="rule-form" :disabled="busy" data-testid="rule-save">{{ busy ? t('automations.form.saving') : t('automations.form.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
