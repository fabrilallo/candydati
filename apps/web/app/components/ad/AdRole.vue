<script setup lang="ts">
import { CheckIcon, PlusIcon } from '@lucide/vue'
import { optionalHints, type OptionalKey } from '@/lib/ad-gaps'
import { employmentBenefits } from '@/lib/employment-view'
import type { JobContent } from '@tt/domain'

/** The role: introduction, what you will do, requirements split in two, technologies as tags, benefits. */
const props = defineProps<{ content: JobContent }>()
const ad = useAdContext()
const id = useId()

const preview = computed(() => ad.value.mode === 'preview')
/** Quantified terms first ("Buoni pasto 8 € al giorno, elettronici"), then the free lines. */
const structured = computed(() => employmentBenefits(props.content.employment, { currency: props.content.salary.currency, language: ad.value.language }, ad.value.x))
const protectedSentence = computed(() => {
  const flag = props.content.protectedCategories
  return flag === 'reserved' || flag === 'also' ? ad.value.x(`public.protectedCategories.${flag}`) : null
})
const hints = computed(() => {
  const c = props.content
  const all = preview.value ? optionalHints({ ...c, niceToHave: c.requirements.niceToHave, benefits: [...c.benefits, ...structured.value] }) : []
  return Object.fromEntries(all.map((hint) => [hint.key, hint])) as Partial<Record<OptionalKey, (typeof all)[number]>>
})
const mustHave = computed(() => props.content.requirements.mustHave)
const niceToHave = computed(() => props.content.requirements.niceToHave)
const showRequirements = computed(() => mustHave.value.length > 0 || niceToHave.value.length > 0 || preview.value)
const pad = (n: number): string => String(n).padStart(2, '0')
</script>

<template>
  <section :aria-labelledby="id" class="grid gap-9">
    <div class="grid gap-3">
      <component :is="ad.heading(1)" :id="id" class="text-xl font-semibold tracking-tight">{{ ad.x('public.headings.role') }}</component>
      <p v-if="content.summary" class="text-[0.9375rem] leading-relaxed whitespace-pre-line @2xl:text-base" data-section="summary"><VagueText :text="content.summary" /></p>
      <AdHint v-else-if="hints.summary" :hint="hints.summary" />
    </div>

    <div v-if="content.responsibilities.length || ad.gaps.responsibilities" class="grid gap-3" data-section="responsibilities">
      <component :is="ad.heading(2)" class="text-base font-semibold tracking-tight">{{ ad.x('public.headings.responsibilities') }}</component>
      <ol v-if="content.responsibilities.length" class="divide-y border-y">
        <li v-for="(item, index) in content.responsibilities" :key="index" class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 py-3 text-[0.9375rem] leading-relaxed">
          <span class="figure pt-0.5 text-xs font-medium text-muted-foreground" aria-hidden="true">{{ pad(index + 1) }}</span>
          <span><VagueText :text="item" /></span>
        </li>
      </ol>
      <AdGap v-if="ad.gaps.responsibilities" :gap="ad.gaps.responsibilities" />
    </div>

    <div v-if="showRequirements" class="grid gap-3">
      <component :is="ad.heading(2)" class="text-base font-semibold tracking-tight">{{ ad.x('public.headings.requirements') }}</component>
      <div class="grid overflow-hidden rounded-xl border bg-card" :class="niceToHave.length || hints.niceToHave ? '@xl:grid-cols-2' : ''">
        <div class="grid content-start gap-3 p-5" data-section="mustHave">
          <component :is="ad.heading(3)" class="text-sm font-medium text-muted-foreground">{{ ad.x('public.headings.mustHave') }}</component>
          <ul v-if="mustHave.length" class="grid gap-2.5">
            <li v-for="(item, index) in mustHave" :key="index" class="flex gap-2.5 text-[0.9375rem] leading-snug">
              <CheckIcon class="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
              <span><VagueText :text="item" /></span>
            </li>
          </ul>
          <AdGap v-if="ad.gaps.mustHave" :gap="ad.gaps.mustHave" size="sm" />
        </div>
        <div v-if="niceToHave.length || hints.niceToHave" class="grid content-start gap-3 border-t p-5 @xl:border-t-0 @xl:border-l" data-section="niceToHave">
          <component :is="ad.heading(3)" class="text-sm font-medium text-muted-foreground">{{ ad.x('public.headings.niceToHave') }}</component>
          <ul v-if="niceToHave.length" class="grid gap-2.5">
            <li v-for="(item, index) in niceToHave" :key="index" class="flex gap-2.5 text-[0.9375rem] leading-snug">
              <PlusIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span><VagueText :text="item" /></span>
            </li>
          </ul>
          <AdHint v-else-if="hints.niceToHave" :hint="hints.niceToHave" />
        </div>
      </div>
    </div>

    <div v-if="content.technologies.length || hints.technologies" class="grid gap-3" data-section="technologies">
      <component :is="ad.heading(2)" class="text-base font-semibold tracking-tight">{{ ad.x('public.headings.technologies') }}</component>
      <ul v-if="content.technologies.length" class="flex flex-wrap gap-1.5">
        <li v-for="(item, index) in content.technologies" :key="index" class="rounded-md border bg-card px-2.5 py-1 text-sm font-medium shadow-xs">
          <VagueText :text="item" />
        </li>
      </ul>
      <AdHint v-else-if="hints.technologies" :hint="hints.technologies" />
    </div>

    <div v-if="content.benefits.length || structured.length || hints.benefits" class="grid gap-3" data-section="benefits">
      <component :is="ad.heading(2)" class="text-base font-semibold tracking-tight">{{ ad.x('public.headings.benefits') }}</component>
      <ul v-if="content.benefits.length || structured.length" class="grid gap-x-8 border-t @xl:grid-cols-2">
        <li v-for="(item, index) in structured" :key="`s${index}`" class="figure border-b py-3 text-[0.9375rem] leading-snug font-medium" data-testid="employment-benefit">{{ item }}</li>
        <li v-for="(item, index) in content.benefits" :key="index" class="border-b py-3 text-[0.9375rem] leading-snug">
          <VagueText :text="item" />
        </li>
      </ul>
      <AdHint v-else-if="hints.benefits" :hint="hints.benefits" />
    </div>

    <p v-if="protectedSentence" class="rounded-lg border bg-card px-4 py-3 text-[0.9375rem] leading-relaxed text-pretty" data-testid="protected-categories">{{ protectedSentence }}</p>
  </section>
</template>
