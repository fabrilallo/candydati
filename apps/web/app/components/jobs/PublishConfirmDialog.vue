<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatScore, type QualityView } from '@/lib/quality-view'

/** Below the threshold the score asks for a second thought, it never blocks: "Pubblica comunque" is always there. */
defineProps<{ open: boolean; view: QualityView | null; pending?: boolean }>()
defineEmits<{ cancel: []; confirm: [] }>()
const { t, locale } = useI18n()
</script>

<template>
  <Dialog :open="open" @update:open="(next) => !next && $emit('cancel')">
    <DialogContent class="sm:max-w-lg" data-testid="below-threshold-dialog">
      <DialogHeader>
        <DialogTitle>{{ t('job.publish.belowTitle') }}</DialogTitle>
        <DialogDescription v-if="view">
          {{ t('job.publish.belowBody', { total: formatScore(view.total, locale), max: view.max, threshold: formatScore(view.threshold, locale) }) }}
        </DialogDescription>
      </DialogHeader>
      <p v-if="view" class="flex items-baseline gap-1.5" aria-hidden="true">
        <span class="figure text-4xl leading-none font-semibold tracking-tighter">{{ formatScore(view.total, locale) }}</span>
        <span class="text-sm text-muted-foreground">{{ t('job.quality.outOf', { max: view.max }) }}</span>
        <span class="ml-2 text-xs font-medium text-warning">{{ t('job.quality.threshold', { threshold: formatScore(view.threshold, locale) }) }}</span>
      </p>
      <div v-if="view?.improvements.length" class="grid gap-2.5 border-t pt-4">
        <h3 class="text-sm font-medium">{{ t('job.publish.belowImprovements') }}</h3>
        <ol class="grid gap-2 text-sm" data-testid="below-improvements">
          <li v-for="(item, index) in view.improvements" :key="item" class="grid grid-cols-[1.5rem_minmax(0,1fr)] leading-relaxed">
            <span class="figure text-xs leading-relaxed text-muted-foreground" aria-hidden="true">{{ index + 1 }}.</span>
            <span>{{ item }}</span>
          </li>
        </ol>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="pending" data-testid="back-to-edit" @click="$emit('cancel')">{{ t('job.publish.back') }}</Button>
        <Button type="button" :disabled="pending" data-testid="publish-anyway" @click="$emit('confirm')">{{ pending ? t('job.publish.publishing') : t('job.publish.anyway') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
