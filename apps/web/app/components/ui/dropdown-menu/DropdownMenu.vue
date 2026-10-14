<script setup lang="ts">
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from "reka-ui"
import { DropdownMenuRoot, useForwardPropsEmits } from "reka-ui"

// Non modal: a modal menu marks the whole page aria-hidden while it holds focusable controls (axe aria-hidden-focus).
// Reka still moves focus into the menu, closes it on Escape and outside click, and returns focus to the trigger.
const props = withDefaults(defineProps<DropdownMenuRootProps>(), { modal: false })
const emits = defineEmits<DropdownMenuRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuRoot
    v-slot="slotProps"
    data-slot="dropdown-menu"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </DropdownMenuRoot>
</template>
