<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import type { Locale } from '@candydati/domain'
import { helpResults, helpSections } from '@/lib/help'

/**
 * The help recipes the person's role can follow: by area, or the matches of the search box. The query lives in `?q=` so
 * a colleague can be sent straight to an answer.
 */
const { t, locale } = useI18n()
const { viewer } = useViewer()
const route = useRoute()
const router = useRouter()
const role = computed(() => viewer.value?.role ?? null)
const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const searching = computed(() => query.value.trim().length > 0)
const sections = computed(() => helpSections(role.value, locale.value as Locale))
const results = computed(() => (searching.value ? helpResults(role.value, locale.value as Locale, query.value) : []))

watch(query, (value) => {
  const q = value.trim()
  void router.replace({ query: { ...route.query, q: q.length > 0 ? q : undefined } })
})
</script>

<template>
  <div class="grid gap-8">
    <div class="relative max-w-xl">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input v-model="query" type="search" class="pl-9" :placeholder="t('help.searchPlaceholder')" :aria-label="t('help.search')" data-testid="help-search" />
    </div>

    <section v-if="searching" class="grid gap-3" aria-live="polite">
      <h2 class="text-sm font-medium text-muted-foreground">{{ t('help.results', { count: results.length }) }}</h2>
      <HelpRecipe v-for="(recipe, index) in results" :key="recipe.id" :recipe="recipe" :open="index === 0" />
      <p v-if="results.length === 0" class="text-[0.9375rem] text-muted-foreground" data-testid="help-empty">{{ t('help.empty') }}</p>
    </section>

    <template v-else>
      <section v-for="section in sections" :key="section.area" :aria-labelledby="`help-${section.area}`" class="grid gap-3">
        <h2 :id="`help-${section.area}`" class="text-lg font-bold tracking-tight">{{ t(`help.areas.${section.area}`) }}</h2>
        <HelpRecipe v-for="recipe in section.recipes" :key="recipe.id" :recipe="recipe" />
      </section>
    </template>
  </div>
</template>
