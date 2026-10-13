<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
import { OUTCOMES, type Outcome } from '@tt/domain'
import type { StageRef } from '@/lib/candidate-schemas'
import { stageLabelKey, stageTone } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * "Esito" (secondary, asks for confirmation) and "Sposta in" (primary) for one open application. Moving never sends
 * anything to the candidate; deciding closes the application for good.
 */
const props = defineProps<{ name: string; stages: readonly StageRef[]; stageId: string; canMove: boolean; canDecide: boolean; busy: boolean }>()
const emit = defineEmits<{ move: [stageId: string]; decide: [outcome: Outcome] }>()
const { t } = useI18n()
const chosen = ref<Outcome | null>(null)
const confirmOpen = computed({
  get: () => chosen.value !== null,
  set: (open: boolean) => {
    if (!open) chosen.value = null
  },
})
const confirm = (): void => {
  if (chosen.value) emit('decide', chosen.value)
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
        <DropdownMenuItem v-for="outcome in OUTCOMES" :key="outcome" :data-testid="`detail-decide-${outcome}`" @select="chosen = outcome">{{ t(`candidate.outcomes.${outcome}`) }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu v-if="canMove">
      <DropdownMenuTrigger as-child>
        <Button :disabled="busy || others.length === 0" data-testid="move-menu">{{ t('candidate.actions.moveTo') }}<ChevronDownIcon aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-60">
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('candidate.actions.moveHint') }}</DropdownMenuLabel>
        <DropdownMenuItem v-for="stage in others" :key="stage.id" :data-testid="`detail-move-${stage.id}`" @select="emit('move', stage.id)">
          <StageDot :tone="stageTone(stage)" />{{ t(stageLabelKey(stage)) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('candidate.decide.title')"
      :body="chosen ? t('candidate.decide.body', { name, outcome: t(`candidate.outcomes.${chosen}`) }) : ''"
      :confirm-label="t('candidate.decide.confirm')"
      :pending="busy"
      @confirm="confirm"
    />
  </div>
</template>
