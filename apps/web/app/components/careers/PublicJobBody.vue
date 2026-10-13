<script setup lang="ts">
import type { PublicJobPageDto } from '@tt/domain'
import { formatDate } from '@/lib/format'
import { careersPath, formatDuration, placeLine, salaryLine } from '@/lib/job-view'

const props = defineProps<{ page: PublicJobPageDto }>()
const content = computed(() => props.page.job.content)
const lang = content.value.language
// Everything on this page reads in the language of the ad, whatever the visitor's locale.
const x = await useAdTranslate(lang)

const facts = computed(() => {
  const c = content.value
  const days = c.location.onsiteDaysPerWeek
  const where = [placeLine({ workMode: c.workMode, location: c.location }, lang), days === undefined ? '' : x('public.onsiteDays', { count: days })].filter((part) => part !== '')
  return [
    { key: 'salary', label: x('public.salary'), value: salaryLine(c.salary, lang, x) },
    { key: 'contract', label: x('public.contract'), value: x(`taxonomy.contractTypes.${c.contractType}`) },
    { key: 'seniority', label: x('public.seniority'), value: x(`taxonomy.seniority.${c.seniority}`) },
    { key: 'workMode', label: x('public.workMode'), value: x(`taxonomy.workModes.${c.workMode}`) },
    ...(where.length ? [{ key: 'location', label: x('public.location'), value: where.join(' · ') }] : []),
  ]
})
const lists = computed(() => [
  { key: 'responsibilities', items: content.value.responsibilities },
  { key: 'mustHave', items: content.value.requirements.mustHave },
  { key: 'niceToHave', items: content.value.requirements.niceToHave },
  { key: 'technologies', items: content.value.technologies },
  { key: 'benefits', items: content.value.benefits },
].filter((list) => list.items.length > 0))
const texts = computed(() => [
  { key: 'growth', body: content.value.growth },
  { key: 'workLifeBalance', body: content.value.workLifeBalance },
  { key: 'culture', body: content.value.culture },
].filter((text) => text.body !== ''))
</script>

<template>
  <article :lang="lang" class="grid gap-8" data-testid="public-job">
    <header class="grid gap-4">
      <OrgHeading :organization="page.organization" :logo-alt="x('careers.logo', { organization: page.organization.name })" />
      <h1 class="text-3xl font-semibold tracking-tight">{{ content.title }}</h1>
      <p class="text-sm text-muted-foreground">{{ x(`taxonomy.roles.${content.role}`) }} · {{ x('public.published', { date: formatDate(page.job.publishedAt, lang, 'UTC') }) }}</p>
    </header>

    <dl class="grid gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-2" data-testid="job-facts">
      <div v-for="fact in facts" :key="fact.key" class="grid gap-0.5" :data-fact="fact.key">
        <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ fact.label }}</dt>
        <dd class="text-sm font-medium">{{ fact.value }}</dd>
      </div>
    </dl>

    <p v-if="content.summary" class="whitespace-pre-line leading-relaxed">{{ content.summary }}</p>

    <section aria-labelledby="process-title" class="grid gap-3" data-testid="job-process">
      <h2 id="process-title" class="text-xl font-semibold tracking-tight">{{ x('public.process') }}</h2>
      <p class="text-sm text-muted-foreground">{{ x('public.processIntro') }}</p>
      <ol class="grid gap-2">
        <li v-for="(stage, index) in content.process" :key="index" class="grid gap-0.5 rounded-lg border bg-card px-4 py-3" data-testid="job-stage">
          <p class="font-medium">{{ index + 1 }}. {{ x(`taxonomy.stageTypes.${stage.type}`) }}</p>
          <p class="text-sm text-muted-foreground">{{ x('public.stageMeta', { duration: formatDuration(stage.durationMinutes, x), who: x(`taxonomy.stageConductors.${stage.conductedBy}`) }) }}</p>
          <p v-if="stage.note" class="text-sm">{{ stage.note }}</p>
        </li>
      </ol>
      <div class="rounded-lg border border-dashed px-4 py-3" data-testid="job-response-time">
        <p class="text-sm font-medium">{{ x('public.responseTime') }}</p>
        <p class="text-sm text-muted-foreground">{{ x('public.responseValue', { count: content.responseDays }) }}</p>
      </div>
    </section>

    <section v-for="list in lists" :key="list.key" :aria-labelledby="`h-${list.key}`" class="grid gap-3" :data-section="list.key">
      <h2 :id="`h-${list.key}`" class="text-xl font-semibold tracking-tight">{{ x(`public.headings.${list.key}`) }}</h2>
      <ul class="grid list-disc gap-1.5 pl-5">
        <li v-for="item in list.items" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section v-for="text in texts" :key="text.key" :aria-labelledby="`h-${text.key}`" class="grid gap-3" :data-section="text.key">
      <h2 :id="`h-${text.key}`" class="text-xl font-semibold tracking-tight">{{ x(`public.headings.${text.key}`) }}</h2>
      <p class="whitespace-pre-line leading-relaxed">{{ text.body }}</p>
    </section>

    <footer>
      <NuxtLink :to="careersPath(page.organization.slug)" class="text-sm font-medium underline underline-offset-4">{{ x('public.backToJobs') }}</NuxtLink>
    </footer>
  </article>
</template>
