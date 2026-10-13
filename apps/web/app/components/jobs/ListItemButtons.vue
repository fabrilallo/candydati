<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps<{ index: number; count: number; disabled?: boolean; removeLabel: string; upLabel: string; downLabel: string }>()
defineEmits<{ remove: []; move: [delta: -1 | 1] }>()
</script>

<template>
  <div class="flex shrink-0 gap-1">
    <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === 0" :aria-label="upLabel" @click="$emit('move', -1)">
      <ArrowUpIcon aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled || index === count - 1" :aria-label="downLabel" @click="$emit('move', 1)">
      <ArrowDownIcon aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled" :aria-label="removeLabel" @click="$emit('remove')">
      <Trash2Icon aria-hidden="true" />
    </Button>
  </div>
</template>
