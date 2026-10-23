<script setup lang="ts">
import type { MigrationStageTarget } from '@candydati/domain'
import { STAGE_TARGETS, stageTargetKey, type StageNameGroup } from '@/lib/migration-view'
import { NativeSelect } from '@/components/ui/native-select'

/** "Apply to every stage named X": one choice for the same name across every job. */
defineProps<{ groups: readonly StageNameGroup[]; pending: boolean }>()
const emit = defineEmits<{ choose: [name: string, type: MigrationStageTarget] }>()
const { t } = useI18n()
const isTarget = (value: string): value is MigrationStageTarget => (STAGE_TARGETS as readonly string[]).includes(value)
const choose = (name: string, value: string): void => {
  if (isTarget(value)) emit('choose', name, value)
}
</script>

<template>
  <section class="grid gap-3" aria-labelledby="migration-names-title" data-testid="migration-stage-names">
    <div class="grid gap-1">
      <h3 id="migration-names-title" class="text-base font-semibold tracking-tight">{{ t('migrations.stages.byName.title') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('migrations.stages.byName.intro') }}</p>
    </div>
    <ul class="divide-y overflow-hidden rounded-xl panel">
      <li v-for="(group, index) in groups" :key="group.key" class="grid items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:px-6" :data-name="group.key">
        <div class="grid min-w-0 gap-0.5">
          <label :for="`migration-name-${index}`" class="truncate text-[0.9375rem] font-medium">{{ group.name }}</label>
          <span class="text-xs text-muted-foreground">{{ t('migrations.stages.byName.jobs', { count: group.jobs }, group.jobs) }}</span>
        </div>
        <NativeSelect
          :id="`migration-name-${index}`"
          :model-value="group.type ?? ''"
          :disabled="pending"
          :aria-label="t('migrations.stages.byName.select', { name: group.name })"
          data-testid="migration-name-select"
          @update:model-value="(value: string) => choose(group.name, value)"
        >
          <option v-if="group.type === null" value="" disabled>{{ t('migrations.stages.byName.mixed') }}</option>
          <option v-for="target in STAGE_TARGETS" :key="target" :value="target" :disabled="target === 'other'">{{ t(stageTargetKey(target)) }}</option>
        </NativeSelect>
      </li>
    </ul>
  </section>
</template>
