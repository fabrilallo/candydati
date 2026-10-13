<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue'
import type { ExtractionDto } from '@/lib/candidate-schemas'
import { extractionView } from '@/lib/extraction-view'

/**
 * What was read from the CV, clearly labelled as an automatic extraction: the original document is the source of
 * truth and stays one tab away.
 */
const props = defineProps<{ extraction: ExtractionDto | null }>()
const { t } = useI18n()
const view = computed(() => extractionView(props.extraction))
const period = (from?: string, to?: string): string => [from, to].filter((part) => part).join(' - ')
</script>

<template>
  <section class="grid gap-4" aria-labelledby="cv-data-title" data-testid="cv-extraction" :data-kind="view.kind">
    <div class="grid gap-1">
      <h3 id="cv-data-title" class="flex items-center gap-2 text-base font-semibold tracking-tight">
        <SparklesIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('candidate.extraction.title') }}
      </h3>
      <p class="text-sm text-muted-foreground">{{ t('candidate.extraction.disclaimer') }}</p>
    </div>

    <p v-if="view.kind !== 'done'" class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground" data-testid="extraction-state">
      {{ t(`candidate.extraction.states.${view.kind}`) }}
    </p>

    <div v-else class="grid gap-6">
      <p v-if="view.data.headline" class="text-[0.9375rem] font-medium">{{ view.data.headline }}</p>

      <div v-if="view.data.experiences.length > 0" class="grid gap-3">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('candidate.extraction.experiences') }}</h4>
        <ol class="grid gap-4 border-l border-border pl-4" data-testid="extraction-experiences">
          <li v-for="(item, index) in view.data.experiences" :key="index" class="grid gap-0.5">
            <p class="text-sm font-medium">{{ item.title }}<span v-if="item.company" class="font-normal text-muted-foreground">, {{ item.company }}</span></p>
            <p v-if="item.from || item.to" class="figure text-xs text-muted-foreground">{{ period(item.from, item.to) }}</p>
            <p v-if="item.summary" class="text-sm text-pretty text-muted-foreground">{{ item.summary }}</p>
          </li>
        </ol>
      </div>

      <div v-if="view.data.education.length > 0" class="grid gap-3">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('candidate.extraction.education') }}</h4>
        <ul class="grid gap-2">
          <li v-for="(item, index) in view.data.education" :key="index" class="text-sm">
            <span class="font-medium">{{ item.title }}</span>
            <span v-if="item.institution" class="text-muted-foreground">, {{ item.institution }}</span>
            <span v-if="item.year" class="figure text-muted-foreground"> ({{ item.year }})</span>
          </li>
        </ul>
      </div>

      <div v-if="view.data.skills.length > 0" class="grid gap-2">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('candidate.extraction.skills') }}</h4>
        <ul class="flex flex-wrap gap-1.5" data-testid="extraction-skills">
          <li v-for="skill in view.data.skills" :key="skill" class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">{{ skill }}</li>
        </ul>
      </div>

      <div v-if="view.data.languages.length > 0" class="grid gap-2">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('candidate.extraction.languages') }}</h4>
        <p class="text-sm">{{ view.data.languages.join(', ') }}</p>
      </div>
      <p v-if="view.source === 'text'" class="text-xs text-muted-foreground">{{ t('candidate.extraction.fromText') }}</p>
    </div>
  </section>
</template>
