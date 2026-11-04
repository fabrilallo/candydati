<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
import { OUTCOMES, type HireDatesInput, type Outcome, type StageRef } from '@candydati/domain'
import { EMPTY_HIRE_DRAFT, hireDatesBody, hireDatesProblemKey, type HireDraft } from '@/lib/hire-dates'
import { stageName, stageTone } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * "Esito" (secondary, asks for confirmation) and "Sposta in" (primary) for one open application. Moving never sends
 * anything to the candidate; deciding closes the application for good.
 */
const props = defineProps<{ name: string; stages: readonly StageRef[]; stageId: string; canMove: boolean; canDecide: boolean; busy: boolean; appliedAt: string }>()
const emit = defineEmits<{ move: [stageId: string]; decide: [outcome: Outcome, hireDates: HireDatesInput] }>()
const { t } = useI18n()
const chosen = ref<Outcome | null>(null)
const confirmOpen = computed({
  get: () => chosen.value !== null,
  set: (open: boolean) => {
    if (!open) chosen.value = null
  },
})
const hireDraft = ref<HireDraft>(EMPTY_HIRE_DRAFT)
const hireProblem = computed(() => (chosen.value === 'hired' ? hireDatesProblemKey(props.appliedAt, hireDraft.value) : null))
const choose = (outcome: Outcome): void => {
  hireDraft.value = EMPTY_HIRE_DRAFT
  chosen.value = outcome
}
const confirm = (): void => {
  if (chosen.value) emit('decide', chosen.value, chosen.value === 'hired' ? hireDatesBody(hireDraft.value) : {})
  chosen.value = null
}
const others = computed(() => props.stages.filter((stage) => stage.id !== props.stageId))
</script>

<template>
  <div v-if="canMove || canDecide" class="flex flex-wrap items-center gap-2">
    <DropdownMenu v-if="canDecide">
      <DropdownMenuTrigger as-child>
        <Button variant="outline" :disabled="busy" data-testid="decide-menu">{{ t('candidate.actions.decide') }}<ChevronDownIcon aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuItem v-for="outcome in OUTCOMES" :key="outcome" :data-testid="`detail-decide-${outcome}`" @select="choose(outcome)">{{ t(`candidate.outcomes.${outcome}`) }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu v-if="canMove">
      <DropdownMenuTrigger as-child>
        <Button :disabled="busy || others.length === 0" data-testid="move-menu">{{ t('candidate.actions.moveTo') }}<ChevronDownIcon aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-60">
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('candidate.actions.moveHint') }}</DropdownMenuLabel>
        <DropdownMenuItem v-for="stage in others" :key="stage.id" :data-testid="`detail-move-${stage.id}`" @select="emit('move', stage.id)">
          <StageDot :tone="stageTone(stage)" />{{ stageName(stage, t) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('candidate.decide.title')"
      :body="chosen ? t('candidate.decide.body', { name, outcome: t(`candidate.outcomes.${chosen}`) }) : ''"
      :confirm-label="t('candidate.decide.confirm')"
      :pending="busy"
      :confirm-disabled="hireProblem !== null"
      @confirm="confirm"
    >
      <HireDatesFields v-if="chosen === 'hired'" v-model="hireDraft" :applied-at="appliedAt" id-prefix="actions-hire" />
    </ConfirmDialog>
  </div>
</template>
