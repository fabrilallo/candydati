<script setup lang="ts">
import { ChevronDownIcon, CircleCheckIcon, CircleDashedIcon } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Gap } from '@/lib/ad-gaps'

/**
 * Compact readiness: "Pronto per pubblicare", or "Mancano 4 elementi" opening the list of gaps. Opening it reveals
 * the rules on the form fields too; choosing a gap jumps to its field.
 */
const props = defineProps<{ gaps: readonly Gap[] }>()
const emit = defineEmits<{ jump: [fieldId: string]; reveal: [] }>()
const { t } = useI18n()
const onOpen = (open: boolean): void => {
  if (open) emit('reveal')
}
const count = computed(() => props.gaps.length)
/** The jump waits for the menu to close, otherwise the menu gives focus back to its trigger. */
const pending = ref<string | null>(null)
const onCloseAutoFocus = (event: Event): void => {
  if (pending.value === null) return
  event.preventDefault()
  emit('jump', pending.value)
  pending.value = null
}
</script>

<template>
  <p v-if="count === 0" class="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-success" data-testid="readiness-ready">
    <CircleCheckIcon class="size-4" aria-hidden="true" />
    {{ t('job.editor.workspace.ready') }}
  </p>
  <DropdownMenu v-else @update:open="onOpen">
    <DropdownMenuTrigger
      class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-warning transition-colors duration-150 ease-snap hover:bg-warning-soft data-[state=open]:bg-warning-soft"
      data-testid="readiness"
    >
      <CircleDashedIcon class="size-4" aria-hidden="true" />
      <span class="sm:hidden" aria-hidden="true">{{ t('job.editor.workspace.missingShort', { count }, count) }}</span>
      <span class="max-sm:sr-only">{{ t('job.checklist.missing', { count }, count) }}</span>
      <ChevronDownIcon class="size-3.5" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80 max-w-[calc(100vw-2rem)]" @close-auto-focus="onCloseAutoFocus">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('job.checklist.title') }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem v-for="gap in gaps" :key="gap.slot" class="items-start" data-testid="readiness-gap" @select="pending = gap.fieldId">
        <CircleDashedIcon class="mt-0.5 size-4 text-warning" aria-hidden="true" />
        <span>{{ t(gap.messageKey) }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
