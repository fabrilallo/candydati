<script setup lang="ts">
import { ArrowRightIcon, FileArchiveIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/**
 * Step 1 "Source": where the migration package comes from. Today only an uploaded package; connectors for the main ATS
 * products will join as further cards in this list, each with its beta notice.
 */
const emit = defineEmits<{ choose: [source: 'package'] }>()
const { t } = useI18n()
</script>

<template>
  <section class="grid gap-6" aria-labelledby="migration-source-title" data-testid="migration-source-step">
    <div class="grid gap-1">
      <h2 id="migration-source-title" class="text-lg font-semibold tracking-tight">{{ t('migrations.source.title') }}</h2>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.intro') }}</p>
    </div>

    <ul class="grid gap-3">
      <li>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
          <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground" aria-hidden="true"><FileArchiveIcon class="size-5" /></span>
          <div class="grid min-w-0 flex-1 gap-1">
            <h3 class="text-[0.9375rem] font-medium">{{ t('migrations.source.package.title') }}</h3>
            <p class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.package.body') }}</p>
          </div>
          <Button type="button" data-testid="source-package" @click="emit('choose', 'package')">
            {{ t('migrations.source.package.action') }}<ArrowRightIcon aria-hidden="true" />
          </Button>
        </div>
      </li>
    </ul>

    <section class="grid gap-2 border-t pt-6" aria-labelledby="migration-where-title" data-testid="migration-where">
      <h3 id="migration-where-title" class="text-base font-semibold tracking-tight">{{ t('migrations.source.where.title') }}</h3>
      <p class="max-w-2xl text-sm text-pretty">{{ t('migrations.source.where.skill') }}</p>
      <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('migrations.source.where.connectors') }}</p>
    </section>
  </section>
</template>
