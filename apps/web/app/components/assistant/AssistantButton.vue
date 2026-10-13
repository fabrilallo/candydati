<script setup lang="ts">
import { BotIcon } from '@lucide/vue'
import { shortcutLabel } from '@/lib/page-context'
import { Button } from '@/components/ui/button'

/** "Assistente" in the top bar of every app page, with its keyboard shortcut. */
const { t } = useI18n()
const assistant = useAssistant()
const shortcut = ref('Ctrl J')
onMounted(() => {
  shortcut.value = shortcutLabel(navigator.platform)
})
</script>

<template>
  <Button
    variant="ghost"
    size="sm"
    :aria-expanded="assistant.open.value"
    :aria-keyshortcuts="shortcut === '⌘J' ? 'Meta+J' : 'Control+J'"
    :title="t('assistant.shortcut', { keys: shortcut })"
    data-testid="assistant-button"
    @click="assistant.toggle"
  >
    <BotIcon aria-hidden="true" />
    <span class="max-sm:sr-only">{{ t('assistant.title') }}</span>
    <kbd class="hidden rounded border bg-muted px-1 font-sans text-[0.6875rem] leading-4 text-muted-foreground figure md:inline">{{ shortcut }}</kbd>
  </Button>
</template>
