<script setup lang="ts">
import { MailCheckIcon } from '@lucide/vue'
import type { SelectionStage } from '@tt/domain'
import { processSummaryText } from '@/lib/ad-facts'
import { formatDuration } from '@/lib/job-view'

/** The selection process as a sequence the candidate can plan around, ending with the response commitment. */
const props = defineProps<{ process: readonly SelectionStage[]; responseDays: number | undefined }>()
const ad = useAdContext()
const summary = computed(() => processSummaryText(props.process, ad.value.x))
const id = useId()
</script>

<template>
  <section :aria-labelledby="id" class="grid gap-5" data-testid="job-process">
    <div class="grid gap-1.5">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <component :is="ad.heading(1)" :id="id" class="text-xl font-semibold tracking-tight">{{ ad.x('public.process') }}</component>
        <p v-if="summary" class="figure text-sm text-muted-foreground" data-testid="process-summary">{{ summary }}</p>
      </div>
      <p class="text-[0.9375rem] text-muted-foreground">{{ ad.x('public.processIntro') }}</p>
    </div>

    <AdGap v-if="ad.gaps.process" :gap="ad.gaps.process" />

    <ol class="grid">
      <li v-for="(stage, index) in process" :key="index" class="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 pb-6" data-testid="job-stage">
        <span class="absolute top-9 bottom-1 left-4 w-px -translate-x-1/2 bg-border" aria-hidden="true" />
        <span class="figure grid size-8 place-items-center rounded-full border bg-card text-xs font-semibold shadow-xs" aria-hidden="true">{{ index + 1 }}</span>
        <div class="grid gap-1 pt-1">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <component :is="ad.heading(2)" class="text-[0.9375rem] font-medium">{{ ad.x(`taxonomy.stageTypes.${stage.type}`) }}</component>
            <span class="figure text-sm font-medium text-muted-foreground" data-testid="stage-duration">{{ formatDuration(stage.durationMinutes, ad.x) }}</span>
          </div>
          <p class="text-sm text-muted-foreground">{{ ad.x('public.facts.conductedBy', { who: ad.x(`taxonomy.stageConductors.${stage.conductedBy}`) }) }}</p>
          <p v-if="stage.note" class="text-sm leading-relaxed"><VagueText :text="stage.note" /></p>
        </div>
      </li>
      <li class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4" data-testid="job-response-time">
        <span class="grid size-8 place-items-center rounded-full bg-foreground text-background" aria-hidden="true">
          <MailCheckIcon class="size-4" />
        </span>
        <div class="grid gap-1 pt-1">
          <component :is="ad.heading(2)" class="text-[0.9375rem] font-medium">{{ ad.x('public.responseTime') }}</component>
          <p v-if="responseDays !== undefined" class="text-sm text-muted-foreground">{{ ad.x('public.responseValue', { count: responseDays }) }}</p>
          <AdGap v-if="ad.gaps.responseDays" :gap="ad.gaps.responseDays" size="sm" />
        </div>
      </li>
    </ol>
  </section>
</template>
