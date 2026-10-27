<script setup lang="ts">
import { salaryFigure, salaryLabelKey } from '@/lib/ad-facts'
import { employmentFacts } from '@/lib/employment-view'
import type { JobContent } from '@candydati/domain'
import { placeLine } from '@/lib/job-view'

/**
 * The transparency band, right under the title: the salary as the headline figure, the number of stages beside it,
 * then the quieter facts (contract, level, work mode, place). The salary is the one yellow block (DESIGN-SYSTEM.md §5.8).
 */
const props = defineProps<{ content: JobContent }>()
const ad = useAdContext()

const salary = computed(() => salaryFigure(props.content.salary, ad.value.language))
const stages = computed(() => props.content.process.length)

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
  <section :aria-label="ad.x('public.salary')" class="grid gap-4" data-testid="job-facts">
    <div class="grid gap-2.5 @md:grid-cols-2">
      <div
        class="grid min-w-0 content-center gap-0.5 rounded-xl border-2 border-ink px-4 py-3"
        :class="salary ? 'bg-highlight text-highlight-foreground' : 'bg-card'"
        data-fact="salary"
      >
        <p class="text-sm font-semibold first-letter:uppercase">{{ ad.x(salaryLabelKey(content.salary.period)) }}</p>
        <p v-if="salary" class="figure text-[1.5rem] leading-tight font-extrabold tracking-tight @md:text-[1.75rem]">{{ salary }}</p>
        <AdGap v-if="ad.gaps.salary" :gap="ad.gaps.salary" />
      </div>
      <dl class="grid min-w-0 content-center gap-0.5 rounded-xl border-2 border-ink bg-card px-4 py-3" data-fact="process">
        <dt class="text-sm font-semibold text-muted-foreground">{{ ad.x('public.process') }}</dt>
        <dd v-if="stages > 0" class="figure text-[1.5rem] leading-tight font-extrabold tracking-tight @md:text-[1.75rem]">{{ ad.x('public.facts.stages', { count: stages }) }}</dd>
        <dd v-if="ad.gaps.process"><AdGap :gap="ad.gaps.process" size="sm" /></dd>
      </dl>
    </div>
    <dl v-if="quiet.length" class="grid grid-cols-2 gap-x-5 gap-y-3 @xl:grid-cols-4">
      <div v-for="fact in quiet" :key="fact.key" class="grid content-start gap-0.5" :data-fact="fact.key">
        <dt class="text-xs font-medium text-muted-foreground">{{ fact.label }}</dt>
        <dd v-if="fact.value" class="text-sm font-semibold">{{ fact.value }}</dd>
        <dd v-if="fact.detail" class="text-xs text-muted-foreground">{{ fact.detail }}</dd>
        <dd v-if="fact.gap"><AdGap :gap="fact.gap" size="sm" /></dd>
      </div>
    </dl>
  </section>
</template>
