<script setup lang="ts">
import type { AutomationPackRuleDto, AutomationPackRuleInput, EmailTemplateDto, StageAnchor } from '@candydati/domain'
import type { MemberRow } from '@/lib/auth-api'
import { anchorLabelKey, anchorOptions, packRuleToForm, validatePackRuleForm, type PackRuleFormErrors } from '@/lib/automation-pack-view'
import { EMPTY_RULE_FORM, type RuleForm } from '@/lib/automation-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Add or edit a rule of a pack: which kind of stage it acts on, then when, only if and what happens, like a rule of a
 * job. No preview: a pack has no candidates until it is attached to a job.
 */
const props = defineProps<{
  open: boolean
  rule: AutomationPackRuleDto | null
  templates: readonly EmailTemplateDto[]
  members: readonly MemberRow[]
  busy: boolean
  errorKey: string | null
}>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [input: AutomationPackRuleInput] }>()
const { t } = useI18n()
const stage = ref<StageAnchor | ''>('')
const form = ref<RuleForm>(EMPTY_RULE_FORM)
const errors = ref<PackRuleFormErrors>({})
watch(
  () => [props.open, props.rule] as const,
  ([open, rule]) => {
    if (!open) return
    stage.value = rule?.stage ?? ''
    form.value = rule ? packRuleToForm(rule) : EMPTY_RULE_FORM
    errors.value = {}
  },
  { immediate: true },
)
const patch = (change: Partial<RuleForm>): void => {
  form.value = { ...form.value, ...change }
}
const label = (anchor: StageAnchor): string => t(anchorLabelKey(anchor))
/** Where a proposed move can go: the other stage types, never back to received. */
const moveTargets = computed(() => (stage.value === '' ? [] : anchorOptions(stage.value).map((anchor) => ({ id: anchor, label: label(anchor) }))))
const submit = (): void => {
  const result = validatePackRuleForm(form.value, stage.value, props.rule?.enabled ?? true)
  errors.value = result.errors
  if (result.input) emit('save', result.input)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-testid="pack-rule-dialog">
      <DialogHeader>
        <DialogTitle>{{ rule ? t('automationPacks.rules.editTitle') : t('automationPacks.rules.addTitle') }}</DialogTitle>
        <DialogDescription>{{ t('automationPacks.rules.description') }}</DialogDescription>
      </DialogHeader>
      <form id="pack-rule-form" class="grid gap-5" novalidate @submit.prevent="submit">
        <FormField id="pack-rule-stage" :label="t('automationPacks.rules.stage')" :error="errors.stage" :hint="t('automationPacks.rules.stageHint')">
          <template #default="{ invalid, describedBy }">
            <NativeSelect id="pack-rule-stage" v-model="stage" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="pack-rule-stage">
              <option value="" disabled>{{ t('automationPacks.rules.stagePlaceholder') }}</option>
              <option v-for="anchor in anchorOptions(null)" :key="anchor" :value="anchor">{{ label(anchor) }}</option>
            </NativeSelect>
          </template>
        </FormField>
        <RuleTriggerFields :form="form" :errors="errors" @patch="patch" />
        <RuleConditionsFields :form="form" :errors="errors" @patch="patch" />
        <RuleActionFields :form="form" :errors="errors" :templates="templates" :members="members" :stages="moveTargets" @patch="patch" />
        <FormAlert :message-key="errorKey" />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="busy" @click="emit('update:open', false)">{{ t('job.actions.cancel') }}</Button>
        <Button type="submit" form="pack-rule-form" :disabled="busy" data-testid="pack-rule-save">{{ busy ? t('automations.form.saving') : t('automations.form.save') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
