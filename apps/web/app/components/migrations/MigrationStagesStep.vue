<script setup lang="ts">
import type { MigrationBatchDto, MigrationStageTarget } from '@candydati/domain'
import { CircleCheckIcon } from '@lucide/vue'
import { jobViews, stageNameGroups, unmappedCount } from '@/lib/migration-view'
import { Button } from '@/components/ui/button'

/**
 * Step 5 "Jobs and stages": where each stage of the old process lands (one choice per name for every job, or stage by
 * stage), and which jobs stay behind. Each choice is saved as it is made. Stages of jobs that stay must all have a place.
 */
const props = defineProps<{ batch: MigrationBatchDto; pending: boolean; errorKey: string | null }>()
const emit = defineEmits<{
  byName: [name: string, type: MigrationStageTarget]
  stage: [jobRef: string, stageRef: string, type: MigrationStageTarget, title: string]
  excluded: [jobRefs: readonly string[]]
  back: []
  next: []
}>()
const { t } = useI18n()
const remaining = computed(() => unmappedCount(props.batch))
const names = computed(() => stageNameGroups(props.batch.stageMapping))
const jobs = computed(() => jobViews(props.batch))
const toggleJob = (jobRef: string, include: boolean): void => {
  const others = props.batch.excludedJobs.filter((ref) => ref !== jobRef)
  emit('excluded', include ? others : [...others, jobRef])
}
</script>

<template>
  <section class="grid gap-8" aria-labelledby="migration-stages-title" data-testid="migration-stages-step">
    <div class="grid gap-1">
      <h2 id="migration-stages-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.stages.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.stages.intro') }}</p>
      <p class="text-sm text-muted-foreground">{{ t('migrations.stages.received') }}</p>
    </div>

    <p
      v-if="remaining > 0"
      class="figure text-sm font-medium text-warning"
      role="status"
      data-testid="migration-remaining"
    >{{ t('migrations.stages.remaining', { count: remaining }, remaining) }}</p>
    <p v-else class="flex items-center gap-2 text-sm font-medium text-success" role="status" data-testid="migration-all-mapped"><CircleCheckIcon class="size-4" aria-hidden="true" />{{ t('migrations.stages.allDone') }}</p>

    <MigrationStageNames :groups="names" :pending="pending" @choose="(name, type) => emit('byName', name, type)" />
    <MigrationJobStages :jobs="jobs" :pending="pending" @stage="(jobRef, stageRef, type, title) => emit('stage', jobRef, stageRef, type, title)" @include="toggleJob" />

    <div class="grid gap-3 border-t pt-6">
      <FormAlert :message-key="errorKey" />
      <div class="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" :disabled="pending" @click="emit('back')">{{ t('migrations.stages.back') }}</Button>
        <Button type="button" :disabled="pending || remaining > 0" data-testid="migration-stages-next" @click="emit('next')">{{ t('migrations.stages.next') }}</Button>
      </div>
    </div>
  </section>
</template>
