<script setup lang="ts">
import type { MigrationConnectorDto } from '@candydati/domain'
import { ArrowRightIcon, ExternalLinkIcon, FileArchiveIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { guideUrl } from '@/lib/guide-links'

/**
 * Step 1 "Source": an uploaded package, or one of the built-in connectors this installation offers (each with its beta
 * notice). The package card is always there, and below it how to get a package without one: a connector list that is loading, empty or failed never hides it.
 */
const emit = defineEmits<{ choose: [source: 'package']; connect: [connector: MigrationConnectorDto] }>()
const { t, locale } = useI18n()
const connectors = useMigrationConnectors()
const steps = ['one', 'two', 'three'] as const
</script>

<template>
  <section class="grid gap-6" aria-labelledby="migration-source-title" data-testid="migration-source-step">
    <div class="grid gap-1">
      <h2 id="migration-source-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.source.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.intro') }}</p>
    </div>

    <ul class="grid gap-3" :aria-label="t('migrations.source.connectors.label')">
      <li>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl panel px-5 py-5 sm:px-6">
          <span class="grid size-11 shrink-0 place-items-center rounded-md bg-muted text-foreground" aria-hidden="true"><FileArchiveIcon class="size-5" /></span>
          <div class="grid min-w-0 flex-1 gap-1">
            <h3 class="text-[0.9375rem] font-medium">{{ t('migrations.source.package.title') }}</h3>
            <p class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.package.body') }}</p>
          </div>
          <Button type="button" data-testid="source-package" @click="emit('choose', 'package')">
            {{ t('migrations.source.package.action') }}<ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      </li>
      <li v-for="connector in connectors.items.value ?? []" :key="connector.id">
        <MigrationConnectorCard :connector="connector" @connect="emit('connect', connector)" />
      </li>
      <li v-if="connectors.items.value === null && connectors.pending.value" aria-busy="true">
        <span class="sr-only">{{ t('migrations.source.connectors.loading') }}</span><Skeleton class="h-20 w-full" />
      </li>
    </ul>
    <p v-if="connectors.errorKey.value" class="text-sm text-muted-foreground" role="status" data-testid="migration-connectors-error">{{ t('migrations.source.connectors.error') }}</p>

    <section class="grid gap-3 border-t pt-6" aria-labelledby="migration-where-title" data-testid="migration-where">
      <h3 id="migration-where-title" class="text-base font-semibold tracking-tight">{{ t('migrations.source.where.title') }}</h3>
      <p class="max-w-2xl text-sm text-pretty">{{ t('migrations.source.where.connectors') }}</p>
      <p class="max-w-2xl text-sm text-pretty">{{ t('migrations.source.where.intro') }}</p>
      <ol class="grid max-w-2xl list-decimal gap-1.5 pl-5 text-sm text-pretty text-muted-foreground">
        <li v-for="step in steps" :key="step">{{ t(`migrations.source.where.steps.${step}`) }}</li>
      </ol>
      <a :href="guideUrl('migration', locale)" target="_blank" rel="noopener noreferrer" class="flex w-fit items-center gap-1 text-sm font-medium text-link underline-offset-4 hover:underline" data-testid="migration-guide">
        {{ t('migrations.source.where.guide') }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
      </a>
    </section>
  </section>
</template>
