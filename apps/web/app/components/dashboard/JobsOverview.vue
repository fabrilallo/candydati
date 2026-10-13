<script setup lang="ts">
import { ExternalLinkIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { hasAnyJob } from '@/lib/job-counts'

/** Overview of the organization's jobs: real totals per status, the careers page, or the first steps when empty. */
const props = defineProps<{ careersPath: string | null; canCreate: boolean; canInvite: boolean }>()
const { t } = useI18n()
const { counts, errorKey, loading, refresh } = useJobCounts()
const empty = computed(() => counts.value !== null && !hasAnyJob(counts.value))
</script>

<template>
  <div class="grid gap-6">
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="loading && !counts" class="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3" aria-busy="true" data-testid="counts-loading">
      <div v-for="n in 3" :key="n" class="grid gap-3 bg-card px-6 py-6">
        <Skeleton class="h-4 w-20" />
        <Skeleton class="h-11 w-14" />
        <Skeleton class="h-4 w-40" />
      </div>
    </div>
    <FirstSteps v-else-if="empty" :careers-path="props.careersPath" :can-create="props.canCreate" :can-invite="props.canInvite" />
    <template v-else-if="counts">
      <JobCountsStrip :counts="counts" />
      <section v-if="careersPath" aria-labelledby="careers-title" class="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
        <div class="grid min-w-0 gap-1">
          <h2 id="careers-title" class="text-[0.9375rem] font-semibold">{{ t('dashboard.careersTitle') }}</h2>
          <p class="max-w-xl text-sm text-muted-foreground">{{ t('dashboard.careersBody') }}</p>
          <code class="mt-1 truncate font-mono text-xs text-muted-foreground">{{ careersPath }}</code>
        </div>
        <Button variant="outline" size="sm" as-child>
          <NuxtLink :to="careersPath" target="_blank">
            {{ t('dashboard.careersOpen') }}
            <ExternalLinkIcon aria-hidden="true" />
          </NuxtLink>
        </Button>
      </section>
    </template>
  </div>
</template>
