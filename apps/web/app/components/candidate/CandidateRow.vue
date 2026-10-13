<script setup lang="ts">
import type { CandidateSummaryDto } from '@tt/domain'
import { fullName, retentionState } from '@/lib/candidate-view'
import { formatDate } from '@/lib/format'
import { relativeTime } from '@/lib/job-list-view'

/** One person of the database: who, how to reach them, tags, applications, and until when the data is kept. */
const props = defineProps<{ candidate: CandidateSummaryDto; now: Date; activeTag: string | null }>()
const emit = defineEmits<{ tag: [tag: string] }>()
const { t, locale } = useI18n()
const name = computed(() => fullName(props.candidate))
const retention = computed(() => retentionState(props.candidate.retentionExpiresAt, props.now))
</script>

<template>
  <li
    class="group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-5 py-4 transition-colors duration-150 ease-snap hover:bg-muted/60 has-[a:focus-visible]:bg-muted/60 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring/50 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,12rem)_6rem_9rem] md:items-center md:gap-x-5"
    data-testid="candidate-row"
  >
    <PersonAvatar :name="name" />
    <div class="grid min-w-0 gap-0.5">
      <h3 class="flex items-center gap-2 text-[0.9375rem] font-medium leading-snug">
        <NuxtLink :to="`/app/candidates/${candidate.id}`" class="truncate outline-none after:absolute after:inset-0" data-testid="candidate-link">{{ name }}</NuxtLink>
        <span v-if="candidate.talentPool" class="shrink-0 rounded-full bg-accent px-2 py-px text-[0.6875rem] font-medium text-accent-foreground" data-testid="talent-pool">{{ t('candidates.talentPoolBadge') }}</span>
      </h3>
      <p class="truncate text-xs text-muted-foreground">{{ candidate.email }}</p>
    </div>
    <ul class="col-start-2 flex min-w-0 flex-wrap gap-1.5 md:col-start-auto" :aria-label="t('candidate.tags.label')">
      <li v-for="tag in candidate.tags.slice(0, 4)" :key="tag">
        <button
          type="button"
          class="relative z-10 rounded-full px-2 py-0.5 text-xs font-medium transition-colors"
          :class="activeTag === tag ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground hover:bg-muted'"
          :aria-pressed="activeTag === tag"
          :title="t('candidates.filterByTag', { tag })"
          @click="emit('tag', tag)"
        >
          {{ tag }}
        </button>
      </li>
    </ul>
    <p class="col-start-2 text-xs text-muted-foreground md:col-start-auto md:text-right">
      <span class="figure text-sm font-medium text-foreground">{{ candidate.applicationCount }}</span>
      {{ t('candidates.applications', { count: candidate.applicationCount }, candidate.applicationCount) }}
      <span v-if="candidate.lastAppliedAt" class="block"><time :datetime="candidate.lastAppliedAt">{{ relativeTime(candidate.lastAppliedAt, now, locale) }}</time></span>
    </p>
    <p class="col-start-2 text-xs text-muted-foreground md:col-start-auto md:text-right" data-testid="candidate-retention">
      {{ t('candidates.keptUntil') }}
      <span class="figure block text-sm" :class="retention === 'ok' ? 'text-foreground' : retention === 'soon' ? 'font-medium text-warning' : 'font-medium text-destructive'">{{ formatDate(candidate.retentionExpiresAt, locale) }}</span>
    </p>
  </li>
</template>
