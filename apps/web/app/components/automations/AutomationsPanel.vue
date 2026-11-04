<script setup lang="ts">
import { CopyIcon, InfoIcon, PlusIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { type AutomationRuleDto, type CopyAutomationsResultDto, pipelineStagesOf, type JobDto } from '@candydati/domain'
import type { RuleInput } from '@/lib/automation-api'
import type { CopySource } from '@/lib/automation-copy-view'
import { describeRule, rulesByStage } from '@/lib/automation-view'
import { can } from '@/lib/permissions-ui'
import { stageName, stageTone } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The rules of a job, one section per stage (same names as the board), each with its trigger, its conditions and what it
 * does. They send, create tasks, tag, assign, ask for feedback, alert or propose a move; they never move or decide, and
 * say so. Rules copy to another stage, another job or a job template.
 */
const props = defineProps<{ job: JobDto }>()
const { t } = useI18n()
const automations = useAutomations(props.job.id)
const templates = useEmailTemplates()
const team = useMembers()
const { viewer } = useViewer()
/** "Chi fa il colloquio" lives next to the rules of each stage too: same list as in the editor. */
const interviewers = can(viewer.value?.role ?? null, 'feedback:manage') ? useJobInterviewers(props.job.id) : null
const stages = computed(() => pipelineStagesOf(props.job.content.process))
const interviewStages = computed(() => new Set(props.job.content.process.flatMap((stage) => (stage.id ? [stage.id] : []))))
const grouped = computed(() => rulesByStage(automations.rules.value ?? [], stages.value.map((stage) => stage.id)))
const names = computed(() => ({
  template: (id: string) => templates.templates.value?.find((item) => item.id === id)?.name ?? null,
  member: team.nameOf,
  stage: (id: string) => {
    const stage = stages.value.find((item) => item.id === id)
    return stage ? stageName(stage, t) : null
  },
  owner: t('automations.form.jobOwner'),
}))
const joinList = (items: readonly string[]): string => items.join(', ')
/** The other stages of the job: where the rule being edited can propose a move to. */
const moveTargets = computed(() => stages.value.filter((stage) => stage.id !== editing.value?.stageId).map((stage) => ({ id: stage.id, label: stageName(stage, t) })))

const editing = ref<{ readonly stageId: string; readonly rule: AutomationRuleDto | null } | null>(null)
const editingStage = computed(() => stages.value.find((stage) => stage.id === editing.value?.stageId) ?? null)
const dialogOpen = computed({
  get: () => editing.value !== null,
  set: (open: boolean) => {
    if (!open) editing.value = null
  },
})
const startEdit = (stageId: string, rule: AutomationRuleDto | null): void => {
  automations.clearError()
  editing.value = { stageId, rule }
}
const save = async (input: RuleInput): Promise<void> => {
  if (await automations.save(editing.value?.rule ?? null, input)) editing.value = null
}
const deleting = ref<AutomationRuleDto | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null
  },
})
const confirmDelete = async (): Promise<void> => {
  if (deleting.value && (await automations.remove(deleting.value))) deleting.value = null
}
const authorOf = (rule: AutomationRuleDto): string | null => team.nameOf(rule.createdBy)

const copying = ref<CopySource | null>(null)
const copyOpen = computed({
  get: () => copying.value !== null,
  set: (open: boolean) => {
    if (!open) copying.value = null
  },
})
const copyLabel = computed(() => names.value.stage(copying.value?.stageId ?? '') ?? '')
/** Copies into this job show up at once; elsewhere they wait in their job or template. */
const copied = async (result: CopyAutomationsResultDto): Promise<void> => {
  copying.value = null
  toast.success(t('automations.copy.done', { count: result.created.length }, result.created.length))
  if (result.to.kind === 'job' && result.to.id === props.job.id) await automations.refresh()
}
</script>

<template>
  <div class="grid gap-6" data-testid="automations-panel">
    <p class="flex items-start gap-2.5 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground" data-testid="automations-note">
      <InfoIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ t('automations.note') }}
    </p>
    <div v-if="automations.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="automations.errorKey.value" />
      <div><Button variant="outline" @click="() => automations.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!automations.rules.value" class="grid gap-4" aria-busy="true"><Skeleton class="h-24 w-full" /><Skeleton class="h-24 w-full" /></div>
    <template v-else>
      <section v-for="stage in stages" :key="stage.id" class="grid gap-3" :aria-labelledby="`automation-stage-${stage.id}`" data-testid="automation-stage" :data-stage-id="stage.id">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 :id="`automation-stage-${stage.id}`" class="flex items-center gap-2 text-base font-semibold tracking-tight">
            <StageDot :tone="stageTone(stage)" />
            {{ t('automations.stageRules', { stage: stageName(stage, t) }) }}
          </h2>
          <div class="flex items-center gap-2">
            <Button v-if="(grouped[stage.id] ?? []).length > 0" variant="ghost" size="sm" :aria-label="t('automations.copy.stageFor', { stage: stageName(stage, t) })" :data-testid="`automation-copy-${stage.id}`" @click="copying = { kind: 'stage', stageId: stage.id }"><CopyIcon aria-hidden="true" />{{ t('automations.copy.stageButton') }}</Button>
            <Button variant="outline" size="sm" :data-testid="`automation-add-${stage.id}`" @click="startEdit(stage.id, null)"><PlusIcon aria-hidden="true" />{{ t('automations.add') }}</Button>
          </div>
        </div>
        <StageInterviewers
          v-if="interviewers && interviewStages.has(stage.id)"
          :id="`automation-stage-${stage.id}-interviewers`"
          :interviewers="interviewers.byStage.value[stage.id] ?? []"
          :members="interviewers.members.value"
          :busy="interviewers.saving.value === stage.id"
          @change="(list) => interviewers?.save(stage.id, list)"
        />
        <p v-if="(grouped[stage.id] ?? []).length === 0" class="rounded-xl border border-dashed border-input px-5 py-3.5 text-sm text-muted-foreground">{{ t('automations.empty') }}</p>
        <ul v-else class="divide-y overflow-hidden rounded-xl panel">
          <AutomationRule
            v-for="rule in grouped[stage.id]"
            :key="rule.id"
            :rule="rule"
            :words="describeRule(rule, names, joinList)"
            :author="authorOf(rule)"
            :busy="automations.busy.value === rule.id"
            @toggle="(enabled) => automations.setEnabled(rule, enabled)"
            @edit="startEdit(stage.id, rule)"
            @delete="deleting = rule"
            @copy="copying = { kind: 'rule', ruleId: rule.id, stageId: rule.stageId }"
          />
        </ul>
      </section>
    </template>
    <RuleDialog
      v-model:open="dialogOpen"
      :job-id="job.id"
      :stage-label="editingStage ? stageName(editingStage, t) : ''"
      :stage-id="editing?.stageId ?? ''"
      :rule="editing?.rule ?? null"
      :templates="templates.templates.value ?? []"
      :members="team.members.value"
      :stages="moveTargets"
      :busy="automations.busy.value !== null"
      :error-key="automations.saveErrorKey.value"
      @save="save"
    />
    <RuleCopyDialog v-model:open="copyOpen" :job-id="job.id" :job-content="job.content" :source="copying" :source-label="copyLabel" @copied="copied" />
    <ConfirmDialog v-model:open="deleteOpen" :title="t('automations.deleteTitle')" :body="t('automations.deleteBody')" :confirm-label="t('automations.deleteConfirm')" :pending="deleting !== null && automations.busy.value === deleting.id" destructive @confirm="confirmDelete" />
  </div>
</template>
