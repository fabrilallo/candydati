<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatScore, type QualityView } from '@/lib/quality-view'

defineProps<{ open: boolean; view: QualityView | null; pending?: boolean }>()
defineEmits<{ cancel: []; confirm: [] }>()
const { t, locale } = useI18n()
</script>

<template>
  <Dialog :open="open" @update:open="(next) => !next && $emit('cancel')">
    <DialogContent data-testid="below-threshold-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('job.publish.belowTitle') }}</DialogTitle>
        <DialogDescription v-if="view">
          {{ t('job.publish.belowBody', { total: formatScore(view.total, locale), max: view.max, threshold: formatScore(view.threshold, locale) }) }}
        </DialogDescription>
      </DialogHeader>
      <div v-if="view?.improvements.length" class="grid gap-2">
        <h3 class="text-sm font-medium">{{ t('job.publish.belowImprovements') }}</h3>
        <ul class="grid list-disc gap-1 pl-5 text-sm" data-testid="below-improvements">
          <li v-for="item in view.improvements" :key="item">{{ item }}</li>
        </ul>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" data-testid="back-to-edit" @click="$emit('cancel')">{{ t('job.publish.back') }}</Button>
        <Button type="button" :disabled="pending" data-testid="publish-anyway" @click="$emit('confirm')">{{ pending ? t('job.publish.publishing') : t('job.publish.anyway') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
