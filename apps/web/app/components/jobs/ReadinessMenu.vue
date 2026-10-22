<script setup lang="ts">
import { ChevronDownIcon, CircleCheckIcon, CircleDashedIcon, OctagonAlertIcon, WandSparklesIcon } from '@lucide/vue'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Gap } from '@/lib/ad-gaps'
import type { ComplianceFix } from '@/lib/compliance-fix'
import type { ComplianceItem } from '@/lib/compliance-view'

/**
 * Compact readiness: "Pronto per pubblicare", or "Mancano 4 elementi" opening the list of gaps. Opening it reveals
 * the rules on the form fields too; choosing a gap jumps to its field.
 */
const props = withDefaults(defineProps<{ gaps: readonly Gap[]; blocking?: readonly ComplianceItem[] }>(), { blocking: () => [] })
const emit = defineEmits<{ jump: [fieldId: string]; reveal: []; fix: [fix: ComplianceFix] }>()
const { t } = useI18n()
const onOpen = (open: boolean): void => {
  if (open) emit('reveal')
}
const count = computed(() => props.gaps.length + props.blocking.length)
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
      <span class="max-sm:sr-only">{{ blocking.length ? t('job.checklist.toFix', { count }, count) : t('job.checklist.missing', { count }, count) }}</span>
      <ChevronDownIcon class="size-3.5" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-80 max-w-[calc(100vw-2rem)]" @close-auto-focus="onCloseAutoFocus">
      <template v-if="blocking.length">
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('job.compliance.menuTitle') }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <template v-for="item in blocking" :key="item.key">
          <DropdownMenuItem class="items-start" data-testid="readiness-compliance" @select="pending = item.fieldId">
            <OctagonAlertIcon class="mt-0.5 size-4 text-destructive" aria-hidden="true" />
            <span class="grid gap-0.5">
              <span>{{ t(item.messageKey) }}</span>
              <span class="text-xs text-muted-foreground">«{{ item.match }}»</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="item.fixes[0]" class="ml-6 text-xs font-medium text-link" data-testid="readiness-fix" @select="emit('fix', item.fixes[0])">
            <WandSparklesIcon class="size-3.5" aria-hidden="true" />
            {{ t(item.fixes[0].labelKey, item.fixes[0].params) }}
          </DropdownMenuItem>
        </template>
      </template>
      <template v-if="gaps.length">
        <DropdownMenuSeparator v-if="blocking.length" />
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('job.checklist.title') }}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem v-for="gap in gaps" :key="gap.slot" class="items-start" data-testid="readiness-gap" @select="pending = gap.fieldId">
          <CircleDashedIcon class="mt-0.5 size-4 text-warning" aria-hidden="true" />
          <span>{{ t(gap.messageKey) }}</span>
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
