<script setup lang="ts">
import { NuxtLink } from '#components'
import { parseMarkdownLite, type Inline } from '@/lib/markdown-lite'

/** The assistant's reply with light formatting. Text interpolation only: no HTML, no images, links to pages of the app only. */
const props = defineProps<{ text: string }>()
const blocks = computed(() => parseMarkdownLite(props.text))
const InlineText = defineComponent({
  props: { inlines: { type: Array as PropType<readonly Inline[]>, required: true } },
  setup: (inner) => () =>
    inner.inlines.map((node) => {
      if (node.kind === 'bold') return h('strong', { class: 'font-semibold' }, node.text)
      if (node.kind === 'italic') return h('em', node.text)
      if (node.kind === 'link') return h(NuxtLink, { to: node.href, class: 'font-medium text-link underline-offset-4 hover:underline' }, () => node.text)
      if (node.kind === 'code') return h('code', { class: 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]' }, node.text)
      return node.text
    }),
})
</script>

<template>
  <div class="grid gap-2.5 text-sm leading-relaxed text-pretty">
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.kind === 'heading'" class="font-semibold"><InlineText :inlines="block.inlines" /></p>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.kind === 'list'" :class="block.ordered ? 'list-decimal' : 'list-disc'" class="grid gap-1 pl-5 marker:text-muted-foreground">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex"><InlineText :inlines="item" /></li>
      </component>
      <p v-else class="whitespace-pre-wrap"><InlineText :inlines="block.inlines" /></p>
    </template>
  </div>
</template>
