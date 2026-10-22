<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
import { MIGRATION_STEPS, type MigrationStep } from '@/lib/migration-view'

/** Where the user is in the migration: numbered steps, done ones ticked, the current one in ink. */
const props = defineProps<{ current: MigrationStep }>()
const { t } = useI18n()
const SHOWN = MIGRATION_STEPS.filter((step) => step !== 'result')
const index = computed(() => MIGRATION_STEPS.indexOf(props.current))
</script>

<template>
  <nav :aria-label="t('migrations.steps.label')">
    <ol class="flex gap-x-1 overflow-x-auto border-b pb-px" data-testid="migration-steps">
      <li v-for="(step, position) in SHOWN" :key="step" class="shrink-0">
        <span
          class="-mb-px flex items-center gap-2 border-b-2 px-2.5 py-2.5 text-sm font-medium whitespace-nowrap"
          :class="position === index ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'"
          :aria-current="position === index ? 'step' : undefined"
          :data-step="step"
        >
          <span
            class="figure grid size-5 place-items-center rounded-full text-xs"
            :class="position < index ? 'bg-success-soft text-success' : position === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
            aria-hidden="true"
          >
            <CheckIcon v-if="position < index" class="size-3" />
            <template v-else>{{ position + 1 }}</template>
          </span>
          {{ t(`migrations.steps.${step}`) }}
        </span>
      </li>
    </ol>
  </nav>
</template>
