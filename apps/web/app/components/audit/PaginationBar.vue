<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{ page: number; pages: number; total: number; disabled?: boolean; statusKey?: string }>(), { statusKey: 'audit.pagination.status' })
const emit = defineEmits<{ 'update:page': [page: number] }>()
const { t } = useI18n()
const go = (next: number): void => emit('update:page', Math.min(Math.max(1, next), props.pages))
</script>

<template>
  <nav :aria-label="t('audit.pagination.label')" class="flex items-center justify-between gap-3">
    <p class="text-sm text-muted-foreground" aria-live="polite">{{ t(statusKey, { page, pages, total }) }}</p>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" :disabled="disabled || page <= 1" @click="go(page - 1)">
        <ChevronLeftIcon aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">{{ t('audit.pagination.previous') }}</span>
      </Button>
      <Button variant="outline" size="sm" :disabled="disabled || page >= pages" @click="go(page + 1)">
        <span class="sr-only sm:not-sr-only">{{ t('audit.pagination.next') }}</span>
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  </nav>
</template>
