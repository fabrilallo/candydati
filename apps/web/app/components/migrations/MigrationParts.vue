<script setup lang="ts">
import type { MigrationBatchDto } from '@candydati/domain'
import { listMigrations } from '@/lib/migration-api'
import { groupParts, partCount } from '@/lib/migration-fetch'
import { migrationTone } from '@/lib/migration-view'
import { Badge } from '@/components/ui/badge'

/**
 * The parts of one connector fetch. A source larger than one package is split into several, each a migration of its
 * own with its preview and its confirmation; this names the part on screen and links to the others.
 */
const props = defineProps<{ batch: MigrationBatchDto }>()
const { t } = useI18n()
const request = useJobsApi()
const others = ref<readonly MigrationBatchDto[]>([])
const parts = computed(() => groupParts(others.value.some((item) => item.id === props.batch.id) ? others.value : [...others.value, props.batch], props.batch))
const total = computed(() => partCount(props.batch, parts.value))

const load = async (): Promise<void> => {
  if (props.batch.groupId === null) return
  try {
    others.value = await listMigrations(request)
  } catch (error) {
    console.error('[migration] parts not loaded', error instanceof Error ? error.message : error)
  }
}
onMounted(load)
// Part 1 learns how many parts there are when the reading ends: the others exist from then on.
watch(() => props.batch.counts.fetch?.parts, (parts, before) => {
  if (parts !== before) void load()
})
</script>

<template>
  <nav v-if="batch.groupId !== null && total > 1" class="grid gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs sm:px-6" :aria-label="t('migrations.parts.label')" data-testid="migration-parts">
    <div class="grid gap-1">
      <p class="text-sm font-semibold" data-testid="migration-part-current">{{ t('migrations.parts.current', { part: batch.part ?? 1, parts: total }) }}</p>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.parts.intro', { parts: total }) }}</p>
    </div>
    <ol class="flex flex-wrap gap-2">
      <li v-for="item in parts" :key="item.id">
        <span v-if="item.id === batch.id" class="inline-flex items-center gap-2 rounded-md border border-primary px-3 py-1.5 text-sm font-medium" aria-current="page">
          {{ t('migrations.parts.part', { part: item.part ?? 1 }) }}<Badge :variant="migrationTone(item.status)">{{ t(`migrations.status.${item.status}`) }}</Badge>
        </span>
        <NuxtLink
          v-else
          :to="`/app/migrations/${encodeURIComponent(item.id)}`"
          class="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent/50"
          :aria-label="t('migrations.parts.open', { part: item.part ?? 1 })"
          :data-part="item.part"
        >
          {{ t('migrations.parts.part', { part: item.part ?? 1 }) }}<Badge :variant="migrationTone(item.status)">{{ t(`migrations.status.${item.status}`) }}</Badge>
        </NuxtLink>
      </li>
    </ol>
  </nav>
</template>
