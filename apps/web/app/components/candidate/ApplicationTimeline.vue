<script setup lang="ts">
import type { StageRef } from '@candydati/domain'
import { formatDateTime } from '@/lib/format'
import { timelineActor, timelineDetail, timelineLabel } from '@/lib/timeline-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The "Cronologia" tab: what happened to one application, oldest first (it reads like the story it is, and the last
 * line is where things stand). Nothing here ranks or scores a person.
 */
const props = defineProps<{ applicationId: string; stages: readonly StageRef[]; viaJobId?: string | null }>()
const { t, locale } = useI18n()
const timeline = useApplicationTimeline(() => props.applicationId, () => props.viaJobId ?? null)
</script>

<template>
  <section class="grid gap-5" data-testid="application-timeline" :aria-labelledby="`timeline-title-${applicationId}`">
    <div class="grid max-w-xl gap-1">
      <h3 :id="`timeline-title-${applicationId}`" class="text-lg font-semibold tracking-tight">{{ t('timeline.title') }}</h3>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('timeline.intro') }}</p>
    </div>
    <div v-if="timeline.errorKey.value" class="grid gap-3" data-testid="timeline-error">
      <FormAlert :message-key="timeline.errorKey.value" />
      <div><Button variant="outline" @click="() => timeline.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!timeline.items.value" class="h-32 w-full" aria-busy="true" />
    <ol v-else class="grid" :aria-label="t('timeline.title')" data-testid="timeline-list">
      <li v-for="item in timeline.items.value" :key="item.id" class="relative grid gap-0.5 border-l border-border pb-5 pl-5 last:pb-0" :data-kind="item.kind" data-testid="timeline-item">
        <span class="absolute top-1.5 -left-[0.3125rem] size-2.5 rounded-full border-2 border-background bg-muted-foreground" aria-hidden="true" />
        <p class="text-[0.9375rem] font-medium text-pretty">{{ timelineLabel(item, stages, t) }}</p>
        <p v-if="timelineDetail(item, stages, t)" class="line-clamp-3 text-sm text-pretty break-words text-muted-foreground" data-testid="timeline-detail">{{ timelineDetail(item, stages, t) }}</p>
        <p class="figure flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <time :datetime="item.at">{{ formatDateTime(item.at, locale) }}</time>
          <template v-if="timelineActor(item.actor, t)"><span aria-hidden="true">·</span><span data-testid="timeline-actor">{{ timelineActor(item.actor, t) }}</span></template>
          <template v-if="item.fromPreviousSystem"><span aria-hidden="true">·</span><span data-testid="timeline-previous">{{ t('timeline.fromPreviousSystem') }}</span></template>
        </p>
      </li>
    </ol>
  </section>
</template>
