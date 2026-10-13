<script setup lang="ts">
import { ChevronRightIcon, LockIcon } from '@lucide/vue'
import type { Operation } from '@/lib/openapi-reference'

/** One route of the reference: method, path and summary; opening it shows parameters, body and responses. */
defineProps<{ operation: Operation }>()
const { t } = useI18n()
</script>

<template>
  <li data-testid="api-operation" :data-operation="operation.id">
    <details class="group">
      <summary class="flex cursor-pointer list-none items-start gap-3 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-snap group-open:rotate-90" aria-hidden="true" />
        <code class="w-14 shrink-0 font-mono text-xs font-semibold leading-5 text-foreground">{{ operation.method }}</code>
        <span class="grid min-w-0 flex-1 gap-0.5">
          <code class="font-mono text-sm break-all">{{ operation.path }}</code>
          <span v-if="operation.summary" class="text-sm text-muted-foreground">{{ operation.summary }}</span>
        </span>
        <span v-if="!operation.auth" class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{{ t('apiReference.public') }}</span>
        <LockIcon v-else class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" :aria-label="t('apiReference.needsKey')" />
      </summary>
      <div class="grid gap-4 border-t bg-background px-5 py-4 sm:px-6 sm:pl-[3.25rem]">
        <p v-if="operation.description" class="max-w-prose text-sm text-muted-foreground">{{ operation.description }}</p>
        <div v-if="operation.parameters.length > 0" class="grid gap-2">
          <p class="text-xs font-semibold">{{ t('apiReference.parameters') }}</p>
          <ul class="grid gap-1.5">
            <li v-for="param in operation.parameters" :key="`${param.in}-${param.name}`" class="flex flex-wrap items-baseline gap-x-2 text-xs">
              <code class="font-mono font-medium">{{ param.name }}</code>
              <span class="text-muted-foreground">{{ t(`apiReference.in.${param.in}`) }}</span>
              <code class="font-mono text-muted-foreground">{{ param.node.label }}</code>
              <span v-if="param.required" class="font-medium">{{ t('apiReference.required') }}</span>
              <span v-if="param.node.enumValues.length > 0" class="text-muted-foreground">{{ param.node.enumValues.join(', ') }}</span>
            </li>
          </ul>
        </div>
        <div v-if="operation.request" class="grid gap-2">
          <p class="text-xs font-semibold">{{ t('apiReference.body') }} <code class="font-mono font-normal text-muted-foreground">{{ operation.request.label }}</code></p>
          <SchemaTree :node="operation.request" />
        </div>
        <div class="grid gap-3">
          <p class="text-xs font-semibold">{{ t('apiReference.responses') }}</p>
          <div v-for="response in operation.responses" :key="response.status" class="grid gap-1.5">
            <p class="flex flex-wrap items-baseline gap-x-2 text-xs">
              <code class="font-mono font-semibold">{{ response.status }}</code>
              <span class="text-muted-foreground">{{ response.description }}</span>
              <code v-if="response.node" class="font-mono text-muted-foreground">{{ response.node.label }}</code>
            </p>
            <SchemaTree v-if="response.node && response.node.fields.length > 0" :node="response.node" />
          </div>
        </div>
      </div>
    </details>
  </li>
</template>
