<script setup lang="ts" generic="T">
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { issueKey } from '@/lib/careers-editor-issues'

/**
 * The items of a section (values, figures, quotes, links, images): each in its own block with move and remove
 * buttons, the add button while below the maximum, and the list's own issue (too few, too many) above.
 */
const props = defineProps<{
  id: string
  label: string
  items: readonly T[]
  max: number
  addLabel: string
  /** Name of one item for screen readers ("Valore 2"). */
  itemLabel: (index: number) => string
  error?: string | undefined
  testid: string
}>()
const emit = defineEmits<{ add: []; move: [from: number, to: number]; remove: [index: number] }>()
const { t } = useI18n()
const full = computed(() => props.items.length >= props.max)
</script>

<template>
  <fieldset class="grid gap-3" :aria-describedby="error ? `${id}-error` : undefined">
    <legend class="mb-1 text-sm font-medium">{{ label }} <span class="figure text-xs font-normal text-muted-foreground">{{ items.length }}/{{ max }}</span></legend>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs font-medium text-destructive">{{ t(issueKey(error)) }}</p>
    <ol class="grid gap-3">
      <li v-for="(item, index) in items" :key="index" class="grid gap-4 rounded-lg border bg-card px-4 py-4" :aria-label="itemLabel(index)" :data-testid="`${testid}-item`">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted-foreground">{{ itemLabel(index) }}</p>
          <div class="flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon-xs" :disabled="index === 0" :aria-label="t('careersEditor.items.up', { item: itemLabel(index) })" @click="emit('move', index, index - 1)">
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" :disabled="index === items.length - 1" :aria-label="t('careersEditor.items.down', { item: itemLabel(index) })" @click="emit('move', index, index + 1)">
              <ArrowDownIcon aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" :aria-label="t('careersEditor.items.remove', { item: itemLabel(index) })" :data-testid="`${testid}-remove-${index}`" @click="emit('remove', index)">
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        </div>
        <slot :item="item" :index="index" />
      </li>
    </ol>
    <div>
      <Button type="button" variant="outline" size="sm" :disabled="full" :data-testid="`${testid}-add`" @click="emit('add')">
        <PlusIcon aria-hidden="true" />{{ addLabel }}
      </Button>
    </div>
  </fieldset>
</template>
