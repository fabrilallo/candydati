<script setup lang="ts">
import type { StageRef } from '@candydati/domain'
import { ArrowRightLeftIcon } from '@lucide/vue'
import { errorKeyOf } from '@/lib/auth-errors'
import { getPipeline } from '@/lib/candidate-api'
import { stageName, stageTone } from '@/lib/pipeline-board'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * "Sposta in" for one row of the attention list. The stages of the job are asked only when the menu opens (a row
 * carries just its own stage). Moving is a person's choice and never sends a message by itself.
 */
const props = defineProps<{ jobId: string; stageId: string; name: string; busy?: boolean }>()
const emit = defineEmits<{ move: [stage: StageRef] }>()
const { t } = useI18n()
const request = useJobsApi()
const stages = ref<readonly StageRef[] | null>(null)
const errorKey = ref<string | null>(null)
const load = async (open: boolean): Promise<void> => {
  if (!open || stages.value) return
  errorKey.value = null
  try {
    stages.value = (await getPipeline(request, props.jobId)).stages.map(({ id, declared }) => ({ id, declared }))
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
}
</script>

<template>
  <DropdownMenu @update:open="load">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" :disabled="busy" :aria-label="`${t('attention.actions.move')}: ${name}`" data-testid="attention-move">
        <ArrowRightLeftIcon aria-hidden="true" /><span class="max-md:sr-only">{{ t('attention.actions.move') }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('attention.actions.move') }}</DropdownMenuLabel>
      <p v-if="errorKey" class="px-2 py-1.5 text-sm text-destructive" role="alert">{{ t(errorKey) }}</p>
      <p v-else-if="!stages" class="px-2 py-1.5 text-sm text-muted-foreground" aria-busy="true">{{ t('attention.actions.loadingStages') }}</p>
      <template v-else>
        <DropdownMenuItem v-for="stage in stages" :key="stage.id" :disabled="stage.id === stageId" :data-testid="`attention-move-to-${stage.id}`" @select="emit('move', stage)">
          <StageDot :tone="stageTone(stage)" />
          <span class="truncate">{{ stageName(stage, t) }}</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
