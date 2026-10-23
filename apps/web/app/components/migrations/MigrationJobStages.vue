<script setup lang="ts">
import type { MigrationStageTarget } from '@candydati/domain'
import { STAGE_TARGETS, stageTargetKey, type JobView } from '@/lib/migration-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Job by job: whether the job comes across, and where each of its stages lands. Jobs with a stage still to choose
 * start open. The list shows a first batch of jobs, more on request, so a package with thousands of jobs stays light.
 */
const props = defineProps<{ jobs: readonly JobView[]; pending: boolean }>()
const emit = defineEmits<{ stage: [jobRef: string, stageRef: string, type: MigrationStageTarget, title: string]; include: [jobRef: string, include: boolean] }>()
const { t } = useI18n()
const PAGE = 25
const shown = ref(PAGE)
const visible = computed(() => props.jobs.slice(0, shown.value))
// Open at the start only: choosing the last stage of a job must not fold the job away under the pointer.
const openAtStart: ReadonlySet<string> = new Set(props.jobs.filter((job) => job.unmapped > 0 && !job.excluded).map((job) => job.count.jobRef))
const isTarget = (value: string): value is MigrationStageTarget => (STAGE_TARGETS as readonly string[]).includes(value)
</script>

<template>
  <section class="grid gap-3" aria-labelledby="migration-jobs-stages-title" data-testid="migration-job-stages">
    <h3 id="migration-jobs-stages-title" class="text-base font-semibold tracking-tight">{{ t('migrations.stages.perJob.title') }}</h3>
    <ul class="grid gap-2">
      <li v-for="(job, jobIndex) in visible" :key="job.count.jobRef" :data-job="job.count.jobRef">
        <details class="group overflow-hidden rounded-xl panel" :open="openAtStart.has(job.count.jobRef)">
          <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 select-none focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden">
            <span class="text-[0.9375rem] font-medium">{{ job.count.title }}</span>
            <Badge variant="outline">{{ t(`migrations.preview.jobs.status.${job.count.status}`) }}</Badge>
            <Badge v-if="job.excluded" variant="secondary">{{ t('migrations.preview.jobs.leftOutPill') }}</Badge>
            <Badge v-else-if="job.unmapped > 0" variant="warning" class="figure">{{ t('migrations.stages.remaining', { count: job.unmapped }, job.unmapped) }}</Badge>
          </summary>
          <div class="grid gap-4 border-t px-5 py-4 sm:px-6">
            <label class="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                class="size-4 shrink-0 rounded-[4px] accent-primary"
                :checked="!job.excluded"
                :disabled="pending"
                data-testid="migration-job-include"
                @change="emit('include', job.count.jobRef, ($event.target as HTMLInputElement).checked)"
              />
              {{ t('migrations.stages.perJob.include') }}
            </label>
            <ul class="grid gap-2">
              <li v-for="(stage, stageIndex) in job.stages" :key="stage.stageRef" class="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_16rem]">
                <label :for="`migration-stage-${jobIndex}-${stageIndex}`" class="truncate text-sm">{{ stage.sourceName }}</label>
                <NativeSelect
                  :id="`migration-stage-${jobIndex}-${stageIndex}`"
                  :model-value="stage.type"
                  :disabled="pending || job.excluded"
                  :aria-label="t('migrations.stages.perJob.select', { stage: stage.sourceName, job: job.count.title })"
                  data-testid="migration-stage-select"
                  @update:model-value="(value: string) => isTarget(value) && emit('stage', job.count.jobRef, stage.stageRef, value, stage.title)"
                >
                  <option v-for="target in STAGE_TARGETS" :key="target" :value="target" :disabled="target === 'other' && stage.type !== 'other'">{{ t(stageTargetKey(target)) }}</option>
                </NativeSelect>
              </li>
            </ul>
          </div>
        </details>
      </li>
    </ul>
    <div v-if="jobs.length > shown" class="flex"><Button type="button" variant="outline" size="sm" @click="shown += PAGE">{{ t('migrations.stages.perJob.showMore') }}</Button></div>
  </section>
</template>
