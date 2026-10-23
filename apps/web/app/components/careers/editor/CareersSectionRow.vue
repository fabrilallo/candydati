<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, GripVerticalIcon, Trash2Icon } from '@lucide/vue'
import type { CareersSection } from '@candydati/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SECTION_ICONS } from '@/lib/careers-section-icons'

/** One section in the list: select it, move it, hide it, delete it (the open positions cannot be deleted). */
const props = defineProps<{
  section: CareersSection
  name: string
  selected: boolean
  canUp: boolean
  canDown: boolean
  draggable: boolean
  dragging: boolean
  issueCount: number
}>()
const emit = defineEmits<{ select: []; up: []; down: []; toggle: []; remove: []; grab: [event: PointerEvent] }>()
const { t } = useI18n()
const removable = computed(() => props.section.type !== 'jobs')
</script>

<template>
  <li
    data-drag-row
    class="group flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-[background-color,border-color,box-shadow] duration-150 ease-snap"
    :class="[selected ? 'border-primary/40 bg-accent' : 'bg-card hover:bg-muted', dragging ? 'shadow-hard-md' : '']"
    data-testid="careers-section-row"
    :data-section-type="section.type"
    :data-section-id="section.id"
  >
    <span
      v-if="draggable"
      class="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing"
      aria-hidden="true"
      data-testid="careers-section-grip"
      @pointerdown="emit('grab', $event)"
    >
      <GripVerticalIcon class="size-4" />
    </span>
    <span v-else class="size-7 shrink-0" aria-hidden="true" />
    <button
      :id="`cp-row-${section.id}`"
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
      :aria-current="selected ? 'true' : undefined"
      data-testid="careers-section-select"
      @click="emit('select')"
    >
      <component :is="SECTION_ICONS[section.type]" class="size-4 shrink-0" :class="selected ? 'text-accent-foreground' : 'text-muted-foreground'" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate text-sm font-medium" :class="section.visible ? '' : 'text-muted-foreground line-through decoration-1'">{{ name }}</span>
      <Badge v-if="!section.visible" variant="outline" data-testid="careers-section-hidden">{{ t('careersEditor.sections.hidden') }}</Badge>
      <Badge v-if="issueCount > 0" variant="destructive" data-testid="careers-section-issues">{{ t('careersEditor.sections.issues', { count: issueCount }, issueCount) }}</Badge>
    </button>
    <div class="flex shrink-0 items-center">
      <Button :id="`cp-up-${section.id}`" type="button" variant="ghost" size="icon-sm" :disabled="!canUp" :aria-label="t('careersEditor.sections.up', { name })" data-testid="careers-section-move-up" @click="emit('up')">
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button :id="`cp-down-${section.id}`" type="button" variant="ghost" size="icon-sm" :disabled="!canDown" :aria-label="t('careersEditor.sections.down', { name })" data-testid="careers-section-move-down" @click="emit('down')">
        <ArrowDownIcon aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" :aria-pressed="!section.visible" :aria-label="t('careersEditor.sections.hide', { name })" data-testid="careers-section-toggle" @click="emit('toggle')">
        <component :is="section.visible ? EyeIcon : EyeOffIcon" aria-hidden="true" />
      </Button>
      <Button v-if="removable" type="button" variant="ghost" size="icon-sm" :aria-label="t('careersEditor.sections.delete', { name })" data-testid="careers-section-delete" @click="emit('remove')">
        <Trash2Icon aria-hidden="true" />
      </Button>
      <span v-else class="size-8" aria-hidden="true" />
    </div>
  </li>
</template>
