<script setup lang="ts">
import { LockIcon } from '@lucide/vue'
import type { StageRef } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stageName } from '@/lib/pipeline-board'
import { restrictableStages } from '@/lib/restricted-stages-api'

/**
 * "Restricted stages" in a job's Team tab (PRODUCT.md §6.2): a switch per declared stage for who may change them,
 * otherwise a lock on the restricted ones. Notes and feedback at those stages reach only a few people.
 */
const props = defineProps<{ jobId: string; stages: readonly StageRef[] }>()
const { t } = useI18n()
const restricted = useRestrictedStages(props.jobId)
const rows = computed(() => restrictableStages(props.stages, restricted.stageIds.value, (stage) => stageName(stage, t)))
</script>

<template>
  <section v-if="rows.length" class="rounded-xl panel" aria-labelledby="restricted-stages-title" data-testid="restricted-stages">
    <div class="grid gap-1 border-b px-5 py-3 sm:px-6">
      <h2 id="restricted-stages-title" class="text-base font-semibold tracking-tight">{{ t('jobTeam.restricted.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('jobTeam.restricted.explain') }}</p>
    </div>
    <div v-if="restricted.errorKey.value" class="grid gap-3 px-5 py-4 sm:px-6">
      <FormAlert :message-key="restricted.errorKey.value" />
      <div><Button variant="outline" @click="() => restricted.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <ul v-else-if="restricted.loaded.value" class="divide-y">
      <li v-for="stage in rows" :key="stage.id" class="flex items-center justify-between gap-4 px-5 py-3 sm:px-6" data-testid="restricted-stage-row">
        <span class="min-w-0 truncate text-sm font-medium">{{ stage.name }}</span>
        <button
          v-if="restricted.canManage.value"
          type="button"
          role="switch"
          :aria-checked="stage.restricted"
          :aria-label="t('jobTeam.restricted.toggle', { stage: stage.name })"
          :disabled="restricted.busy.value !== null"
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
          :class="stage.restricted ? 'bg-primary' : 'bg-input'"
          data-testid="restricted-stage-toggle"
          @click="restricted.toggle(stage.id, !stage.restricted)"
        >
          <span class="size-4 rounded-full bg-card shadow-xs transition-transform duration-150 ease-snap" :class="stage.restricted ? 'translate-x-4.5' : 'translate-x-0.5'" />
        </button>
        <Badge v-else-if="stage.restricted" variant="outline" data-testid="restricted-stage-lock"><LockIcon aria-hidden="true" />{{ t('jobTeam.restricted.badge') }}</Badge>
      </li>
    </ul>
    <div v-else class="h-16 animate-pulse" aria-busy="true" />
  </section>
</template>
