<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Move up, move down, remove; and duplicate when `duplicateLabel` is given (the stages of an ad). */
defineProps<{
  index: number
  count: number
  disabled?: boolean
  removeDisabled?: boolean
  removeDescribedBy?: string
  removeLabel: string
  upLabel: string
  downLabel: string
  duplicateLabel?: string
  duplicateDisabled?: boolean
  duplicateDescribedBy?: string
}>()
defineEmits<{ remove: []; move: [delta: -1 | 1]; duplicate: [] }>()
</script>

<template>
  <div class="flex shrink-0 gap-0.5 text-muted-foreground">
    <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === 0" :aria-label="upLabel" @click="$emit('move', -1)">
      <ArrowUpIcon aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === count - 1" :aria-label="downLabel" @click="$emit('move', 1)">
      <ArrowDownIcon aria-hidden="true" />
    </Button>
    <Button v-if="duplicateLabel" type="button" variant="ghost" size="icon-sm" :disabled="disabled || duplicateDisabled" :aria-label="duplicateLabel" :aria-describedby="duplicateDescribedBy" @click="$emit('duplicate')">
      <CopyIcon aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon-sm" class="hover:bg-destructive-soft hover:text-destructive" :disabled="disabled || removeDisabled" :aria-label="removeLabel" :aria-describedby="removeDescribedBy" @click="$emit('remove')">
      <XIcon aria-hidden="true" />
    </Button>
  </div>
</template>
