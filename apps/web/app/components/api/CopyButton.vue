<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Copies `text` to the clipboard and says so for two seconds; a refusal is said too (select and copy by hand). */
const props = defineProps<{ text: string; label: string }>()
const { t } = useI18n()
const state = ref<'idle' | 'copied' | 'failed'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined
const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.text)
    state.value = 'copied'
  } catch (error) {
    state.value = 'failed'
    console.error('[copy] clipboard refused', error instanceof Error ? error.message : error)
  }
  clearTimeout(timer)
  timer = setTimeout(() => (state.value = 'idle'), 2000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Button type="button" variant="outline" size="sm" :aria-label="label" @click="copy">
    <CheckIcon v-if="state === 'copied'" aria-hidden="true" /><CopyIcon v-else aria-hidden="true" />
    <span aria-live="polite">{{ state === 'copied' ? t('common.copied') : state === 'failed' ? t('common.copyFailed') : t('common.copy') }}</span>
  </Button>
</template>
