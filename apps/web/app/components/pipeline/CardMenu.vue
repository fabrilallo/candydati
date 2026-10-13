<script setup lang="ts">
import { ArrowRightLeftIcon, CircleCheckBigIcon, EllipsisVerticalIcon, PanelRightOpenIcon } from '@lucide/vue'
import { OUTCOMES, type Outcome } from '@tt/domain'
import type { StageRef } from '@/lib/candidate-schemas'
import { stageLabelKey, stageTone } from '@/lib/pipeline-board'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** The accessible way to act on a card: open it, move it ("Sposta in…"), close it with an outcome ("Esito…"). */
defineProps<{ name: string; stages: readonly StageRef[]; stageId: string; canMove: boolean; canDecide: boolean; decided: boolean }>()
const emit = defineEmits<{ open: []; move: [stageId: string]; decide: [outcome: Outcome] }>()
const { t } = useI18n()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="relative z-10 -mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden"
      :aria-label="t('pipeline.card.actions', { name })"
      data-testid="card-menu"
    >
      <EllipsisVerticalIcon class="size-4" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuItem data-testid="card-open" @select="emit('open')"><PanelRightOpenIcon aria-hidden="true" />{{ t('pipeline.card.open') }}</DropdownMenuItem>
      <template v-if="!decided && (canMove || canDecide)">
        <DropdownMenuSeparator />
        <DropdownMenuSub v-if="canMove">
          <DropdownMenuSubTrigger data-testid="card-move"><ArrowRightLeftIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('pipeline.card.moveTo') }}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-60">
            <DropdownMenuItem v-for="stage in stages" :key="stage.id" :disabled="stage.id === stageId" :data-testid="`move-to-${stage.id}`" @select="emit('move', stage.id)">
              <StageDot :tone="stageTone(stage)" />
              <span class="min-w-0 flex-1 truncate">{{ t(stageLabelKey(stage)) }}</span>
              <span v-if="stage.id === stageId" class="text-xs text-muted-foreground">{{ t('pipeline.card.here') }}</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub v-if="canDecide">
          <DropdownMenuSubTrigger data-testid="card-decide"><CircleCheckBigIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('pipeline.card.decide') }}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-56">
            <DropdownMenuItem v-for="outcome in OUTCOMES" :key="outcome" :data-testid="`decide-${outcome}`" @select="emit('decide', outcome)">{{ t(`candidate.outcomes.${outcome}`) }}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
