<script setup lang="ts">
import { approxMinutes, salaryFigure, salaryLabelKey, totalMinutes } from '@/lib/ad-facts'
import { employmentFacts } from '@/lib/employment-view'
import type { JobContent } from '@tt/domain'
import { formatDuration, placeLine } from '@/lib/job-view'

/**
 * The transparency band, right under the title: the salary as the headline figure, the process and the response
 * commitment beside it, then the quieter facts (contract, level, work mode, place). One divided panel, not cards.
 */
const props = defineProps<{ content: JobContent }>()
const ad = useAdContext()

const salary = computed(() => salaryFigure(props.content.salary, ad.value.language))
const stages = computed(() => props.content.process.length)
const about = computed(() => ad.value.x('public.facts.about', { duration: formatDuration(approxMinutes(totalMinutes(props.content.process)), ad.value.x) }))

const quiet = computed(() => {
  const { x, language, gaps } = ad.value
  const c = props.content
  const days = c.location.onsiteDaysPerWeek
  return [
    { key: 'contract', label: x('public.contract'), value: c.contractType ? x(`taxonomy.contractTypes.${c.contractType}`) : '', detail: '', gap: gaps.contractType },
    { key: 'seniority', label: x('public.seniority'), value: c.seniority ? x(`taxonomy.seniority.${c.seniority}`) : '', detail: '', gap: gaps.seniority },
    {
      key: 'workMode',
      label: x('public.workMode'),
      value: c.workMode ? x(`taxonomy.workModes.${c.workMode}`) : '',
      detail: c.workMode !== 'remote' && days !== undefined ? x('public.onsiteDays', { count: days }) : '',
      gap: gaps.workMode,
    },
    { key: 'location', label: x('public.location'), value: placeLine({ workMode: c.workMode, location: c.location }, language), detail: '', gap: gaps.place },
    ...employmentFacts(c.employment, x).map((fact) => ({ ...fact, detail: '', gap: undefined })),
  ].filter((fact) => fact.value !== '' || fact.gap)
})
</script>

<template>
  <section :aria-label="ad.x('public.salary')" class="overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="job-facts">
    <div class="grid @xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="grid content-center gap-2 px-5 py-6 @md:px-6 @md:py-7" data-fact="salary">
        <p class="text-sm font-medium text-muted-foreground first-letter:uppercase">{{ ad.x(salaryLabelKey(content.salary.period)) }}</p>
        <p v-if="salary" class="figure text-[2rem] leading-none font-semibold tracking-tighter @md:text-[2.625rem]">{{ salary }}</p>
        <AdGap v-if="ad.gaps.salary" :gap="ad.gaps.salary" />
      </div>
      <dl class="grid divide-y border-t @xl:border-t-0 @xl:border-l">
        <div class="grid content-center gap-1 px-5 py-4 @md:px-6" data-fact="process">
          <dt class="text-sm font-medium text-muted-foreground">{{ ad.x('public.process') }}</dt>
          <dd v-if="stages > 0" class="grid gap-0.5">
            <span class="figure text-xl font-semibold tracking-tight">{{ ad.x('public.facts.stages', { count: stages }) }}</span>
            <span class="figure text-sm text-muted-foreground">{{ about }}</span>
          </dd>
          <dd v-if="ad.gaps.process"><AdGap :gap="ad.gaps.process" size="sm" /></dd>
        </div>
        <div class="grid content-center gap-1 px-5 py-4 @md:px-6" data-fact="response">
          <dt class="text-sm font-medium text-muted-foreground">{{ ad.x('public.responseTime') }}</dt>
          <dd v-if="content.responseDays !== undefined" class="grid gap-0.5">
            <span class="figure text-xl font-semibold tracking-tight">{{ ad.x('public.facts.within', { count: content.responseDays }) }}</span>
            <span class="text-sm text-muted-foreground">{{ ad.x('public.facts.afterEachStage') }}</span>
          </dd>
          <dd v-if="ad.gaps.responseDays"><AdGap :gap="ad.gaps.responseDays" size="sm" /></dd>
        </div>
      </dl>
    </div>
    <dl v-if="quiet.length" class="grid grid-cols-2 gap-px border-t bg-border @2xl:grid-cols-(--facts)" :style="{ '--facts': `repeat(${quiet.length}, minmax(0, 1fr))` }">
      <div v-for="fact in quiet" :key="fact.key" class="grid content-start gap-1 bg-card px-5 py-3.5 odd:last:col-span-2 @md:px-6 @2xl:odd:last:col-span-1" :data-fact="fact.key">
        <dt class="text-xs text-muted-foreground">{{ fact.label }}</dt>
        <dd v-if="fact.value" class="text-sm font-medium">{{ fact.value }}</dd>
        <dd v-if="fact.detail" class="text-xs text-muted-foreground">{{ fact.detail }}</dd>
        <dd v-if="fact.gap"><AdGap :gap="fact.gap" size="sm" /></dd>
      </div>
    </dl>
  </section>
</template>
