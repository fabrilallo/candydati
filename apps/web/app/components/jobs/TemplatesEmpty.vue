<script setup lang="ts">
import { ArrowRightIcon, CopyPlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps<{ canRead: boolean }>()
const { t } = useI18n()
</script>

<template>
  <section class="grid gap-5 rounded-xl border bg-card px-6 py-10 shadow-xs sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:px-8" data-testid="templates-empty">
    <span class="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground" aria-hidden="true"><CopyPlusIcon class="size-5" /></span>
    <div class="grid max-w-xl gap-4">
      <div class="grid gap-1.5">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('job.templates.emptyTitle') }}</h2>
        <p class="text-[0.9375rem] text-muted-foreground">{{ t('job.templates.emptyBody') }}</p>
      </div>
      <div v-if="canRead">
        <Button as-child variant="outline">
          <NuxtLink to="/app/jobs">{{ t('job.templates.emptyAction') }}<ArrowRightIcon aria-hidden="true" /></NuxtLink>
        </Button>
      </div>
    </div>
  </section>
</template>
