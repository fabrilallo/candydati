<script setup lang="ts">
import { LoaderCircleIcon, SearchIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { talentCriteriaFromJob } from '@/lib/talent-pool-search-view'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * "In your database" for one job: the candidates whose consent covers future positions and whose CV meets every
 * criterion (skills, languages, minimum years, city, words in the CV). A filter, never a ranking: most recent
 * application first. Read only: the recruiter opens a profile and writes from there.
 */
const props = defineProps<{ jobId: string; city: string | null; technologies: readonly string[] }>()
const { t, locale } = useI18n()
const search = useTalentPoolSearch(props.jobId)

const form = reactive({ ...talentCriteriaFromJob({ technologies: props.technologies, city: props.city }) })
const running = computed(() => search.run.value.state === 'running')
const result = computed(() => search.run.value.result)
const pages = computed(() => (result.value ? Math.max(1, Math.ceil(result.value.total / result.value.limit)) : 1))
const submit = (page = 1): void => void search.start({ ...form, minYears: String(form.minYears ?? '') }, page)
</script>

<template>
  <div class="grid gap-4" data-testid="talent-search">
    <p class="text-sm text-muted-foreground">{{ t('talentSearch.lead') }}</p>
    <form class="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_7rem_minmax(0,1fr)]" novalidate data-testid="talent-search-form" @submit.prevent="submit()">
      <FormField id="talent-search-skills" :label="t('talentSearch.skills')" :hint="t('talentSearch.skillsHint')">
        <Input id="talent-search-skills" v-model="form.skills" :placeholder="t('talentSearch.skillsPlaceholder')" data-testid="talent-search-skills" />
      </FormField>
      <FormField id="talent-search-languages" :label="t('talentSearch.languages')">
        <Input id="talent-search-languages" v-model="form.languages" :placeholder="t('talentSearch.languagesPlaceholder')" data-testid="talent-search-languages" />
      </FormField>
      <FormField id="talent-search-years" :label="t('talentSearch.minYears')">
        <Input id="talent-search-years" v-model="form.minYears" type="number" min="0" max="40" data-testid="talent-search-years" />
      </FormField>
      <FormField id="talent-search-location" :label="t('talentSearch.location')" :hint="t('talentSearch.locationHint')">
        <Input id="talent-search-location" v-model="form.location" data-testid="talent-search-location" />
      </FormField>
      <FormField id="talent-search-keywords" class="sm:col-span-2 lg:col-span-4" :label="t('talentSearch.keywords')" :hint="t('talentSearch.keywordsHint')">
        <Input id="talent-search-keywords" v-model="form.keywords" data-testid="talent-search-keywords" />
      </FormField>
      <div class="sm:col-span-2 lg:col-span-4">
        <Button type="submit" :disabled="running" data-testid="talent-search-start">
          <LoaderCircleIcon v-if="running" class="animate-spin motion-reduce:animate-none" aria-hidden="true" /><SearchIcon v-else aria-hidden="true" />{{ t('talentSearch.start') }}
        </Button>
      </div>
    </form>

    <FormAlert v-if="search.run.value.state === 'failed'" :message-key="search.run.value.errorKey ?? 'errors.generic'" data-testid="talent-search-error" />

    <template v-if="search.run.value.state === 'done' && result">
      <p v-if="result.people.length === 0" class="text-sm text-muted-foreground" data-testid="talent-search-none">{{ t('talentSearch.none') }}</p>
      <template v-else>
        <p class="text-sm text-muted-foreground">{{ t('talentSearch.found', { count: result.total }) }}</p>
        <ul class="divide-y overflow-hidden rounded-lg border" data-testid="talent-search-results">
          <li v-for="person in result.people" :key="person.candidateId" class="grid gap-1 px-4 py-3">
            <div class="flex flex-wrap items-center gap-x-2">
              <NuxtLink :to="`/app/candidates/${person.candidateId}`" class="font-medium text-link underline-offset-4 hover:underline" data-testid="talent-search-person">{{ person.fullName }}</NuxtLink>
              <span v-if="person.appliedToThisJob" class="text-xs text-muted-foreground">{{ t('talentSearch.appliedHere') }}</span>
            </div>
            <p v-if="person.lastAppliedAt" class="figure text-sm text-muted-foreground">{{ t('talentSearch.lastApplied', { date: formatDate(person.lastAppliedAt, locale) }) }}</p>
            <p class="text-sm">{{ t('talentSearch.meets', { criteria: result.criteria.join(' · ') }) }}</p>
            <ul v-if="person.skillMatches.length > 0" class="grid gap-0.5 text-sm text-muted-foreground">
              <li v-for="match in person.skillMatches" :key="match.criterion">{{ t('talentSearch.matchedAs', { criterion: match.criterion, matchedAs: match.matchedAs }) }}</li>
            </ul>
          </li>
        </ul>
        <div v-if="pages > 1" class="flex items-center gap-3 text-sm">
          <Button variant="outline" size="sm" :disabled="running || result.page <= 1" data-testid="talent-search-prev" @click="submit(result.page - 1)">{{ t('talentSearch.prev') }}</Button>
          <span class="figure">{{ t('talentSearch.page', { page: result.page, pages }) }}</span>
          <Button variant="outline" size="sm" :disabled="running || result.page >= pages" data-testid="talent-search-next" @click="submit(result.page + 1)">{{ t('talentSearch.next') }}</Button>
        </div>
      </template>
      <p v-if="result.notEvaluable > 0" class="text-sm text-muted-foreground" data-testid="talent-search-unchecked">{{ t('talentSearch.notEvaluable', { count: result.notEvaluable }) }}</p>
    </template>
  </div>
</template>
