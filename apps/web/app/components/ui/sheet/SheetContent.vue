<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { XIcon } from "@lucide/vue"
import { reactiveOmit } from "@vueuse/core"
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from "@/lib/utils"
import { restoreFocus } from "@/lib/restore-focus"

/** Drawer panel from the side of the screen (mobile navigation, side panels). Built on the Dialog primitives. */
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<DialogContentProps & { class?: HTMLAttributes["class"]; side?: "left" | "right" }>(), { side: "left" })
const emits = defineEmits<DialogContentEmits>()
const delegated = reactiveOmit(props, "class", "side")
const forwarded = useForwardPropsEmits(delegated, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      data-slot="sheet-overlay"
      class="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      data-slot="sheet-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'fixed inset-y-0 z-50 flex w-[min(20rem,calc(100%-3rem))] flex-col border-border bg-sidebar text-foreground shadow-lg outline-none duration-300 ease-snap data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200',
        side === 'left' ? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left' : 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        props.class,
      )"
      @close-auto-focus="restoreFocus"
    >
      <slot />
      <DialogClose class="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden">
        <XIcon class="size-4" aria-hidden="true" />
        <span class="sr-only">{{ $t('common.close') }}</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
