<script setup lang="ts">
import { getOpenApiSpec } from '@/lib/api-key-api'
import { loaded } from '@/lib/job-api'
import { referenceGroups } from '@/lib/openapi-reference'
import { OPENAPI_PATH } from '@/lib/api-paths'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The public API reference, rendered here from `/api/v1/openapi.json` (no third-party viewer, no CDN script):
 * routes grouped by tag, each one opens on its parameters, body and responses.
 */
const { t } = useI18n()
const request = useJobsApi()
const { data, refresh, status } = useAsyncData('openapi-spec', () => loaded(() => getOpenApiSpec(request)), { lazy: true, server: false })
const groups = computed(() => (data.value?.data ? referenceGroups(data.value.data) : null))
const version = computed(() => data.value?.data?.info.version ?? '')
const example = 'Authorization: Bearer candydati_…'
const envelope = `{ "success": true, "data": { … }, "error": null }
{ "success": false, "data": null, "error": { "code": "forbidden", "message": "…" } }`
</script>

<template>
  <section class="grid gap-4" aria-labelledby="api-reference-title" data-testid="api-reference">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="grid gap-1">
        <h2 id="api-reference-title" class="text-base font-semibold tracking-tight">{{ t('apiReference.title') }}</h2>
        <p class="max-w-prose text-sm text-muted-foreground">{{ t('apiReference.description') }}</p>
      </div>
      <a :href="OPENAPI_PATH" target="_blank" rel="noopener" class="text-sm font-medium text-link underline-offset-4 hover:underline">{{ t('apiReference.download') }}<span v-if="version" class="figure text-muted-foreground"> v{{ version }}</span></a>
    </div>
    <div class="grid gap-3 text-sm sm:grid-cols-2">
      <div class="grid content-start gap-2">
        <p class="font-medium">{{ t('apiReference.auth') }}</p>
        <pre tabindex="0" class="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs"><code>{{ example }}</code></pre>
      </div>
      <div class="grid content-start gap-2">
        <p class="font-medium">{{ t('apiReference.envelope') }}</p>
        <pre tabindex="0" class="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs leading-relaxed"><code>{{ envelope }}</code></pre>
      </div>
    </div>
    <div v-if="data?.errorKey" class="grid gap-3">
      <FormAlert :message-key="data.errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!groups || status === 'pending'" class="grid gap-3" aria-busy="true"><Skeleton class="h-12 w-full" /><Skeleton class="h-12 w-full" /><Skeleton class="h-12 w-full" /></div>
    <p v-else-if="groups.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground">{{ t('apiReference.empty') }}</p>
    <div v-else class="grid gap-6">
      <div v-for="group in groups" :key="group.tag ?? 'other'" class="grid gap-2" data-testid="api-group">
        <h3 class="text-[0.9375rem] font-medium">
          {{ group.tag ?? t('apiReference.other') }}
          <span v-if="group.description" class="font-normal text-muted-foreground">{{ group.description }}</span>
        </h3>
        <ul class="divide-y overflow-hidden rounded-xl panel">
          <ApiOperation v-for="operation in group.operations" :key="operation.id" :operation="operation" />
        </ul>
      </div>
    </div>
  </section>
</template>
