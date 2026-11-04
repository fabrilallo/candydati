<script setup lang="ts">
import { AUTOMATION_ACTIONS, JOB_OWNER_ASSIGNEE, MAX_DUE_IN_DAYS, NOTIFY_CHANNELS, TAG_MAX, TASK_TITLE_MAX, type EmailTemplateDto } from '@candydati/domain'
import type { MemberRow } from '@/lib/auth-api'
import type { RuleForm, RuleFormErrors } from '@/lib/automation-view'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * What a rule does, and the fields of that action. None of them moves or decides: "propose a move" only shows a
 * suggestion that a person confirms or dismisses.
 */
const props = defineProps<{
  form: RuleForm
  errors: RuleFormErrors
  templates: readonly EmailTemplateDto[]
  members: readonly MemberRow[]
  /** The other stages of the job: where a move can be proposed to. */
  stages: readonly { readonly id: string; readonly label: string }[]
}>()
const emit = defineEmits<{ patch: [change: Partial<RuleForm>] }>()
const { t } = useI18n()
const people = computed(() => [{ id: JOB_OWNER_ASSIGNEE, name: t('automations.form.jobOwner') }, ...props.members.map((member) => ({ id: member.userId, name: member.name }))])
const toggleRecipient = (id: string, on: boolean): void => {
  const next = on ? [...props.form.recipients, id] : props.form.recipients.filter((item) => item !== id)
  emit('patch', { recipients: [...new Set(next)] })
}
const hasDue = computed(() => props.form.type === 'create_task' || props.form.type === 'assign')
</script>

<template>
  <div class="grid gap-5">
    <FormField id="rule-action" :label="t('automations.form.action')">
      <NativeSelect id="rule-action" :model-value="form.type" data-testid="rule-action" @update:model-value="emit('patch', { type: $event as RuleForm['type'] })">
        <option v-for="action in AUTOMATION_ACTIONS" :key="action" :value="action">{{ t(`automations.form.actions.${action}`) }}</option>
      </NativeSelect>
    </FormField>

    <FormField v-if="form.type === 'send_template'" id="rule-template" :label="t('automations.form.template')" :error="errors.templateId" :hint="t('automations.form.sendNote')">
      <template #default="{ invalid, describedBy }">
        <NativeSelect id="rule-template" :model-value="form.templateId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-template" @update:model-value="emit('patch', { templateId: $event })">
          <option value="" disabled>{{ t('automations.form.templatePlaceholder') }}</option>
          <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
        </NativeSelect>
      </template>
    </FormField>

    <FormField v-if="form.type === 'create_task'" id="rule-title" :label="t('automations.form.taskTitle')" :error="errors.title">
      <template #default="{ invalid, describedBy }">
        <Input id="rule-title" :model-value="form.title" :maxlength="TASK_TITLE_MAX" :placeholder="t('tasks.fields.titlePlaceholder')" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-title" @update:model-value="emit('patch', { title: String($event) })" />
      </template>
    </FormField>

    <template v-if="hasDue">
      <div class="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <FormField id="rule-assignee" :label="t('automations.form.assignee')" :error="errors.assignee" :hint="form.type === 'assign' ? t('automations.form.assignNote') : undefined">
          <NativeSelect id="rule-assignee" :model-value="form.assignee" data-testid="rule-assignee" @update:model-value="emit('patch', { assignee: $event })">
            <option v-for="person in people" :key="person.id" :value="person.id">{{ person.name }}</option>
          </NativeSelect>
        </FormField>
        <FormField id="rule-due" :label="t('automations.form.dueInDays')" :error="errors.dueInDays">
          <template #default="{ invalid, describedBy }">
            <Input id="rule-due" :model-value="form.dueInDays" type="number" inputmode="numeric" min="0" :max="MAX_DUE_IN_DAYS" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-due" @update:model-value="emit('patch', { dueInDays: String($event) })" />
          </template>
        </FormField>
      </div>
      <p class="-mt-2 text-xs text-muted-foreground">{{ t('automations.form.dueInDaysHint') }}</p>
    </template>

    <FormField v-if="form.type === 'add_tag'" id="rule-tag" :label="t('automations.form.tag')" :error="errors.tag" :hint="t('automations.form.tagNote')">
      <template #default="{ invalid, describedBy }">
        <Input id="rule-tag" :model-value="form.tag" :maxlength="TAG_MAX" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-tag" @update:model-value="emit('patch', { tag: String($event) })" />
      </template>
    </FormField>

    <p v-if="form.type === 'request_feedback'" class="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="rule-feedback-note">{{ t('automations.form.feedbackNote') }}</p>

    <template v-if="form.type === 'notify'">
      <FormField id="rule-channel" :label="t('automations.form.channel')" :hint="t(`automations.form.channelHints.${form.channel}`)">
        <NativeSelect id="rule-channel" :model-value="form.channel" data-testid="rule-channel" @update:model-value="emit('patch', { channel: $event as RuleForm['channel'] })">
          <option v-for="channel in NOTIFY_CHANNELS" :key="channel" :value="channel">{{ t(`automations.form.channels.${channel}`) }}</option>
        </NativeSelect>
      </FormField>
      <fieldset v-if="form.channel !== 'webhook'" class="grid gap-2" :aria-describedby="errors.recipients ? 'rule-recipients-error' : undefined" data-testid="rule-recipients">
        <legend class="mb-1 text-sm font-medium">{{ t('automations.form.recipients') }}</legend>
        <label v-for="person in people" :key="person.id" class="flex items-center gap-2.5 text-sm">
          <input type="checkbox" class="size-4 accent-primary" :checked="form.recipients.includes(person.id)" :data-testid="`rule-recipient-${person.id}`" @change="toggleRecipient(person.id, ($event.target as HTMLInputElement).checked)" />
          {{ person.name }}
        </label>
        <p v-if="errors.recipients" id="rule-recipients-error" class="text-sm text-destructive" role="alert">{{ t(errors.recipients) }}</p>
      </fieldset>
    </template>

    <template v-if="form.type === 'propose_move'">
      <FormField id="rule-to-stage" :label="t('automations.form.toStage')" :error="errors.toStageId">
        <template #default="{ invalid, describedBy }">
          <NativeSelect id="rule-to-stage" :model-value="form.toStageId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="rule-to-stage" @update:model-value="emit('patch', { toStageId: $event })">
            <option value="" disabled>{{ t('automations.form.toStagePlaceholder') }}</option>
            <option v-for="stage in stages" :key="stage.id" :value="stage.id">{{ stage.label }}</option>
          </NativeSelect>
        </template>
      </FormField>
      <p class="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="rule-propose-note">{{ t('automations.form.proposeNote') }}</p>
    </template>
  </div>
</template>
