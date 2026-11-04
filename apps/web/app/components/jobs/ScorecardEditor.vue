<script setup lang="ts">
import { LockIcon, PlusIcon } from '@lucide/vue'
import { SCORECARD_CRITERIA_MAX, type StageRef } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { stageName } from '@/lib/pipeline-board'

/**
 * "What the interviewers look for" (PRODUCT.md §2.4): the job's evaluation criteria, declared before the interviews,
 * each for every stage or one. Interviewers answer each with a word and evidence; nothing is scored or totalled.
 * Saved apart from the ad, with its own button. Read-only for who cannot manage feedback.
 */
const props = defineProps<{ jobId: string; stages: readonly StageRef[]; canManage: boolean }>()
const { t } = useI18n()
const card = useJobScorecard(props.jobId)
const declared = computed(() => props.stages.filter((stage) => stage.declared !== null).map((stage) => ({ id: stage.id, name: stageName(stage, t) })))
const stageLabel = (stageId: string | null): string => (stageId === null ? t('job.scorecard.everyStage') : (declared.value.find((stage) => stage.id === stageId)?.name ?? ''))
const full = computed(() => card.drafts.value.length >= SCORECARD_CRITERIA_MAX)
const labels = computed(() => card.drafts.value.map((draft) => draft.label))
</script>

<template>
  <JobSection id="job-scorecard" :title="t('job.scorecard.title')" :description="t('job.scorecard.explain')">
    <div v-if="card.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="card.errorKey.value" />
      <div><Button variant="outline" @click="() => card.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!card.loaded.value" class="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" />
    <template v-else-if="canManage">
      <ol v-if="card.drafts.value.length" class="grid divide-y" :aria-label="t('job.scorecard.title')">
        <ScorecardCriterionRow
          v-for="(criterion, index) in card.drafts.value"
          :key="criterion.key"
          :criterion="criterion"
          :index="index"
          :count="card.drafts.value.length"
          :stages="declared"
          :error="card.errors.value[criterion.key] ?? null"
          :disabled="card.saving.value"
          @patch="(changes) => card.patch(index, changes)"
          @move="(delta) => card.move(index, delta)"
          @remove="card.remove(index)"
        />
      </ol>
      <p v-else class="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground" data-testid="scorecard-empty">{{ t('job.scorecard.empty') }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" :disabled="full || card.saving.value" data-testid="criterion-add" @click="card.add"><PlusIcon aria-hidden="true" />{{ t('job.scorecard.add') }}</Button>
        <p v-if="full" class="text-xs text-muted-foreground">{{ t('job.scorecard.full', { max: SCORECARD_CRITERIA_MAX }) }}</p>
      </div>
      <ScorecardSuggestions :job-id="jobId" :existing="labels" :disabled="full || card.saving.value" @add="card.addFrom" />
      <FormAlert v-if="card.saveErrorKey.value" :message-key="card.saveErrorKey.value" />
      <div class="flex flex-wrap items-center gap-3">
        <Button type="button" :disabled="card.saving.value || !card.dirty.value" data-testid="scorecard-save" @click="card.save">{{ card.saving.value ? t('job.scorecard.saving') : t('job.scorecard.save') }}</Button>
        <p v-if="card.dirty.value" class="text-xs text-muted-foreground">{{ t('job.scorecard.unsaved') }}</p>
      </div>
    </template>
    <template v-else>
      <ul v-if="card.drafts.value.length" class="grid divide-y" data-testid="scorecard-readonly">
        <li v-for="criterion in card.drafts.value" :key="criterion.key" class="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid="criterion">
          <span class="flex items-center gap-1.5 text-sm font-medium">
            <LockIcon v-if="criterion.locked" class="size-3.5 text-muted-foreground" :aria-label="t('job.scorecard.lockedShort')" />{{ criterion.label }}
          </span>
          <span class="text-xs text-muted-foreground">{{ stageLabel(criterion.stageId) }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">{{ t('job.scorecard.emptyReadOnly') }}</p>
    </template>
  </JobSection>
</template>
