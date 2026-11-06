<script setup lang="ts">
import { InfoIcon, PlusIcon } from '@lucide/vue'
import type { AutomationPackRuleDto, AutomationPackRuleInput, StageAnchor } from '@candydati/domain'
import { anchorLabelKey, rulesByAnchor } from '@/lib/automation-pack-view'
import { describeRule } from '@/lib/automation-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** The rules of a pack, one section per kind of stage, in pipeline order. Same sentences as the rules of a job. */
const props = defineProps<{ packId: string }>()
const { t } = useI18n()
const rules = usePackRules(props.packId)
const templates = useEmailTemplates()
const team = useMembers()
const groups = computed(() => rulesByAnchor(rules.rules.value ?? []))
const label = (anchor: StageAnchor): string => t(anchorLabelKey(anchor))
const names = computed(() => ({
  template: (id: string) => templates.templates.value?.find((item) => item.id === id)?.name ?? null,
  member: team.nameOf,
  stage: (id: string) => t(anchorLabelKey(id as StageAnchor)),
  owner: t('automations.form.jobOwner'),
}))
const joinList = (items: readonly string[]): string => items.join(', ')

const editing = ref<{ readonly rule: AutomationPackRuleDto | null } | null>(null)
const dialogOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => {
    if (!open) editing.value = null
  },
})
const startEdit = (rule: AutomationPackRuleDto | null): void => {
  rules.clearError()
  editing.value = { rule }
}
const save = async (input: AutomationPackRuleInput): Promise<void> => {
  if (await rules.save(editing.value?.rule ?? null, input)) editing.value = null
}
const deleting = ref<AutomationPackRuleDto | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  },
})
const confirmDelete = async (): Promise<void> => {
  if (deleting.value && (await rules.remove(deleting.value))) deleting.value = null
}
</script>

<template>
  <div class="grid gap-6" data-testid="pack-rules-panel">
    <p class="flex items-start gap-2.5 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="pack-note">
      <InfoIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ t('automationPacks.rules.note') }}
    </p>
    <div class="flex justify-end">
      <Button variant="outline" data-testid="pack-rule-add" @click="startEdit(null)"><PlusIcon aria-hidden="true" />{{ t('automations.add') }}</Button>
    </div>
    <div v-if="rules.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="rules.errorKey.value" />
      <div><Button variant="outline" @click="() => rules.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!rules.rules.value" class="grid gap-4" aria-busy="true"><Skeleton class="h-24 w-full" /></div>
    <p v-else-if="groups.length === 0" class="rounded-xl border border-dashed border-input px-5 py-3.5 text-sm text-muted-foreground" data-testid="pack-rules-empty">{{ t('automationPacks.rules.empty') }}</p>
    <section v-for="group in groups" :key="group.anchor" class="grid gap-3" :aria-labelledby="`pack-anchor-${group.anchor}`" data-testid="pack-anchor" :data-anchor="group.anchor">
      <h2 :id="`pack-anchor-${group.anchor}`" class="text-base font-semibold tracking-tight">{{ t('automationPacks.rules.anchorRules', { stage: label(group.anchor) }) }}</h2>
      <ul class="divide-y overflow-hidden rounded-xl panel">
        <AutomationRule
          v-for="rule in group.rules"
          :key="rule.id"
          :rule="rule"
          :words="describeRule(rule, names, joinList)"
          :author="team.nameOf(rule.createdBy)"
          :busy="rules.busy.value === rule.id"
          :copyable="false"
          @toggle="(enabled) => rules.setEnabled(rule, enabled)"
          @edit="startEdit(rule)"
          @delete="deleting = rule"
        />
      </ul>
    </section>
    <PackRuleDialog
      v-model:open="dialogOpen"
      :rule="editing?.rule ?? null"
      :templates="templates.templates.value ?? []"
      :members="team.members.value"
      :busy="rules.busy.value !== null"
      :error-key="rules.saveErrorKey.value"
      @save="save"
    />
    <ConfirmDialog v-model:open="deleteOpen" :title="t('automations.deleteTitle')" :body="t('automationPacks.rules.deleteBody')" :confirm-label="t('automations.deleteConfirm')" :pending="deleting !== null && rules.busy.value === deleting.id" destructive @confirm="confirmDelete" />
  </div>
</template>
