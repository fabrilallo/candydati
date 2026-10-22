<script setup lang="ts">
import { MailCheckIcon } from '@lucide/vue'
import type { SelectionStage } from '@candydati/domain'
import { processSummaryText } from '@/lib/ad-facts'
import { formatDuration } from '@/lib/job-view'

/**
 * The selection process as a sequence the candidate can plan around. The response time is not shown to candidates;
 * the editor's preview still flags it when missing, because publishing needs it.
 */
const props = defineProps<{ process: readonly SelectionStage[] }>()
const ad = useAdContext()
const summary = computed(() => processSummaryText(props.process, ad.value.x))
const id = useId()
</script>

<template>
  <section :aria-labelledby="id" class="grid gap-5" data-testid="job-process">
    <div class="grid gap-1.5">
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <component :is="ad.heading(1)" :id="id" class="text-[1.75rem] leading-tight font-extrabold tracking-tight">{{ ad.x('public.process') }}</component>
        <p v-if="summary" class="figure text-sm text-muted-foreground" data-testid="process-summary">{{ summary }}</p>
      </div>
      <p class="text-[0.9375rem] text-muted-foreground">{{ ad.x('public.processIntro') }}</p>
    </div>

    <AdGap v-if="ad.gaps.process" :gap="ad.gaps.process" />

    <ol class="grid gap-3.5 @xl:grid-cols-2">
      <li v-for="(stage, index) in process" :key="index" class="grid content-start gap-1.5 rounded-xl border-2 border-ink bg-card p-5" data-testid="job-stage">
        <span class="figure text-[2.75rem] leading-none font-extrabold tracking-[-0.04em]" aria-hidden="true">{{ index + 1 }}</span>
        <component :is="ad.heading(2)" class="text-lg leading-snug font-bold">{{ stage.title ?? ad.x(`taxonomy.stageTypes.${stage.type}`) }}</component>
        <p class="text-[0.9375rem] text-muted-foreground">
          {{ ad.x('public.facts.conductedBy', { who: ad.x(`taxonomy.stageConductors.${stage.conductedBy}`) }) }}
          <span class="mx-1">·</span>
          <span class="figure font-semibold" data-testid="stage-duration">{{ formatDuration(stage.durationMinutes, ad.x) }}</span>
        </p>
        <p v-if="stage.note" class="text-sm leading-relaxed"><VagueText :text="stage.note" /></p>
      </li>
      <li v-if="ad.gaps.responseDays" class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 rounded-xl border-2 border-dashed border-input p-5" data-testid="job-response-time">
        <span class="grid size-8 place-items-center rounded-full bg-foreground text-background" aria-hidden="true">
          <MailCheckIcon class="size-4" />
        </span>
        <div class="grid gap-1 pt-1">
          <component :is="ad.heading(2)" class="text-[0.9375rem] font-medium">{{ ad.x('public.responseTime') }}</component>
          <AdGap :gap="ad.gaps.responseDays" size="sm" />
        </div>
      </li>
    </ol>
  </section>
</template>
