<script setup lang="ts">
import type { JobContent, PublishIssue, VaguePhrase } from '@tt/domain'
import { gapsBySlot } from '@/lib/ad-gaps'
import type { AdMode } from '@/composables/useAdView'

/**
 * The ad exactly as a candidate reads it, in the language of the ad. One rendering for the public page and for
 * the editor preview: in `preview` the missing §5.1 elements show in place as gaps (buttons that focus the field),
 * empty optional sections as faint hints, and the vague phrases of the last analysis are underlined.
 */
const props = withDefaults(
  defineProps<{
    content: JobContent
    organization: { readonly name: string; readonly logo: string | null }
    mode: AdMode
    publishedAt?: string | null
    issues?: readonly PublishIssue[]
    phrases?: readonly VaguePhrase[]
    /** Show gaps in the warning tone (the user asked what is missing). */
    loudGaps?: boolean
  }>(),
  { publishedAt: null, issues: () => [], phrases: () => [], loudGaps: false },
)
const emit = defineEmits<{ jump: [fieldId: string] }>()

const language = computed(() => props.content.language)
const x = useAdText(language)
const preview = computed(() => props.mode === 'preview')
const base = computed(() => (preview.value ? 2 : 1))

provideAdContext(
  computed(() => ({
    mode: props.mode,
    language: language.value,
    x: x.value,
    gaps: preview.value ? gapsBySlot(props.issues) : {},
    loudGaps: props.loudGaps,
    phrases: preview.value ? props.phrases : [],
    heading: (depth: number) => `h${Math.min(6, base.value + depth)}`,
    jump: (fieldId: string) => emit('jump', fieldId),
  })),
)
</script>

<template>
  <article :lang="language" :data-mode="mode" class="@container grid gap-10" data-testid="job-ad">
    <AdHeader :title="content.title" :role="content.role" :seniority="content.seniority" :organization="organization" :published-at="publishedAt" />
    <AdFacts :content="content" />
    <AdProcess :process="content.process" :response-days="content.responseDays" />
    <AdRole :content="content" />
    <AdWorkplace :growth="content.growth" :work-life-balance="content.workLifeBalance" :culture="content.culture" />
  </article>
</template>
