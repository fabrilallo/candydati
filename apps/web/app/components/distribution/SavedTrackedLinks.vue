<script setup lang="ts">
import type { PipelineDto } from '@candydati/domain'
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { buildTrackedLink, channelLabel } from '@/lib/tracked-link'
import type { TrackedLinkDto } from '@/lib/tracked-link-api'
import { matchesSource } from '@/lib/traffic-view'

/**
 * The tracked links saved on the ad, one per channel and campaign: the link to copy (while the ad is published) and,
 * for a viewer who reads candidates, how many applied through it, with the list of who they are. A link without a
 * campaign counts the applications of that channel that came without one. Removing a link changes no figure.
 */
const props = defineProps<{ jobId: string; links: readonly TrackedLinkDto[]; jobUrl: string | null; pipeline: PipelineDto | null; busy: string | null }>()
const emit = defineEmits<{ remove: [linkId: string] }>()
const { t } = useI18n()
const rows = computed(() =>
  props.links.map((link) => {
    const name = channelLabel(link.source, t)
    const filter = { origin: link.source, campaign: link.campaign }
    return {
      link,
      filter,
      name: link.campaign ? `${name} · ${link.campaign}` : name,
      url: props.jobUrl === null ? null : (buildTrackedLink({ jobUrl: props.jobUrl, source: link.source, campaign: link.campaign })?.url ?? null),
      applications: props.pipeline === null ? null : props.pipeline.applications.filter((card) => matchesSource(card, filter)).length,
    }
  }),
)
</script>

<template>
  <div class="grid gap-2" data-testid="tracked-links-saved">
    <h3 class="text-sm font-medium">{{ t('trackedLinks.saved.title') }}</h3>
    <p v-if="links.length === 0" class="text-sm text-muted-foreground" data-testid="tracked-links-none">{{ t('trackedLinks.saved.none') }}</p>
    <ul v-else class="divide-y rounded-lg border">
      <li v-for="row in rows" :key="row.link.id" class="grid gap-2 px-4 py-3" data-testid="tracked-link-row">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span class="min-w-0 truncate text-sm font-medium" data-testid="tracked-link-name">{{ row.name }}</span>
          <span v-if="row.applications !== null" class="figure text-xs text-muted-foreground" data-testid="tracked-link-applications">
            {{ t('trackedLinks.saved.applications', { count: row.applications }, row.applications) }}
          </span>
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <code v-if="row.url" class="min-w-0 basis-full truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs sm:basis-0 sm:flex-1" data-testid="tracked-link-saved-url">{{ row.url }}</code>
          <CopyButton v-if="row.url" :text="row.url" :label="t('trackedLinks.saved.copy', { name: row.name })" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="ml-auto"
            :disabled="busy !== null"
            :aria-label="t('trackedLinks.saved.remove', { name: row.name })"
            data-testid="tracked-link-remove"
            @click="emit('remove', row.link.id)"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
        <details v-if="pipeline && row.applications" class="group" data-testid="tracked-link-people">
          <summary class="cursor-pointer text-xs font-medium text-link underline-offset-4 hover:underline">{{ t('trackedLinks.people.show', { name: row.name }) }}</summary>
          <SourceApplications class="mt-2" :pipeline="pipeline" :filter="row.filter" :job-id="jobId" />
        </details>
      </li>
    </ul>
  </div>
</template>
