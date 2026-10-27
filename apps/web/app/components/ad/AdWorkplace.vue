<script setup lang="ts">
import { optionalHints } from '@/lib/ad-gaps'

/** Growth, work-life balance, culture: label on the left, text on the right. Hidden in public when all empty. */
const props = defineProps<{ growth: string; workLifeBalance: string; culture: string }>()
const ad = useAdContext()
const id = useId()

const rows = computed(() => {
  const hints = ad.value.mode === 'preview' ? optionalHints({ summary: 'x', niceToHave: ['x'], technologies: ['x'], benefits: ['x'], ...props }) : []
  return (['growth', 'workLifeBalance', 'culture'] as const)
    .map((key) => ({ key, body: props[key], hint: hints.find((hint) => hint.key === key) }))
    .filter((row) => row.body !== '' || row.hint)
})
</script>

<template>
  <section v-if="rows.length" :aria-labelledby="id" class="grid gap-2">
    <component :is="ad.heading(1)" :id="id" class="text-xl font-semibold tracking-tight">{{ ad.x('public.headings.workplace') }}</component>
    <div class="divide-y border-y">
      <div v-for="row in rows" :key="row.key" class="grid gap-1 py-3 @xl:grid-cols-[11rem_minmax(0,1fr)] @xl:gap-6" :data-section="row.body ? row.key : undefined">
        <component :is="ad.heading(2)" class="text-sm font-medium text-muted-foreground @xl:pt-0.5">{{ ad.x(`public.headings.${row.key}`) }}</component>
        <p v-if="row.body" class="text-[0.9375rem] leading-relaxed whitespace-pre-line"><VagueText :text="row.body" /></p>
        <AdHint v-else-if="row.hint" :hint="row.hint" />
      </div>
    </div>
  </section>
</template>
