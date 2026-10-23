<script setup lang="ts">
import type { MigrationFetchNotice } from '@candydati/domain'
import { InfoIcon } from '@lucide/vue'

/**
 * What a connector noted about its own reading, for the preview: columns it did not recognise or ignored on purpose
 * (scores and ratings are never imported), rows it skipped, values it left empty. Counts and column headers only, never a
 * cell value of a person.
 */
defineProps<{ notices: readonly MigrationFetchNotice[] }>()
const { t } = useI18n()
</script>

<template>
  <section v-if="notices.length > 0" class="grid gap-3 rounded-xl panel px-5 py-4 sm:px-6" aria-labelledby="migration-notices-title" data-testid="migration-notices">
    <h3 id="migration-notices-title" class="flex items-center gap-2 text-base font-semibold tracking-tight"><InfoIcon class="size-4 text-muted-foreground" aria-hidden="true" />{{ t('migrations.notices.title') }}</h3>
    <ul class="grid gap-2 text-sm">
      <li v-for="notice in notices" :key="notice.code" :data-notice="notice.code" class="grid gap-0.5">
        <span>{{ t(`migrations.notices.${notice.code}`, { count: notice.count }, notice.count) }}</span>
        <span v-if="notice.headers && notice.headers.length > 0" class="font-mono text-xs text-muted-foreground">{{ t('migrations.notices.headers', { headers: notice.headers.join(', ') }) }}</span>
      </li>
    </ul>
    <p v-if="notices.some((notice) => notice.code === 'columns_unrecognized')" class="text-xs text-muted-foreground">{{ t('migrations.notices.hint') }}</p>
  </section>
</template>
