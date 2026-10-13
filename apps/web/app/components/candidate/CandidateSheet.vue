<script setup lang="ts">
import { Maximize2Icon } from '@lucide/vue'
import type { ApplicationCardDto } from '@/lib/candidate-schemas'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/** The candidate profile as a wide side panel over the board, with the way to the full page. */
defineProps<{ candidateId: string | null; applicationId?: string | null }>()
const emit = defineEmits<{ close: []; card: [card: ApplicationCardDto]; noted: [applicationId: string | null] }>()
const { t } = useI18n()
</script>

<template>
  <Sheet :open="candidateId !== null" @update:open="(open: boolean) => !open && emit('close')">
    <SheetContent side="right" class="w-full max-w-2xl gap-0 overflow-y-auto bg-background p-0 sm:w-[min(42rem,calc(100%-3rem))]" data-testid="candidate-sheet">
      <div class="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b bg-background/90 px-5 pr-14 backdrop-blur sm:px-6">
        <SheetTitle class="min-w-0 flex-1 truncate text-sm font-medium">{{ t('candidate.sheet.title') }}</SheetTitle>
        <SheetDescription class="sr-only">{{ t('candidate.sheet.description') }}</SheetDescription>
        <Button v-if="candidateId" as-child variant="ghost" size="sm">
          <NuxtLink :to="`/app/candidates/${candidateId}`" data-testid="open-full-page"><Maximize2Icon aria-hidden="true" />{{ t('candidate.sheet.fullPage') }}</NuxtLink>
        </Button>
      </div>
      <div class="px-5 py-6 sm:px-6">
        <CandidateDetailView v-if="candidateId" :key="candidateId" :candidate-id="candidateId" :application-id="applicationId ?? null" heading="h2" @card="emit('card', $event)" @noted="emit('noted', $event)" />
      </div>
    </SheetContent>
  </Sheet>
</template>
