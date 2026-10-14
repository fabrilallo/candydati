<script setup lang="ts">
import { SUPPORTED_LOCALES, type Locale } from '@tt/domain'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

/**
 * Which language the texts are being written in (the preview follows it), and the page's default language: what a
 * visitor reads when the page has no text in their own.
 */
defineProps<{ defaultLocale: Locale }>()
const editing = defineModel<Locale>('editing', { required: true })
const emit = defineEmits<{ default: [locale: Locale] }>()
const { t } = useI18n()
const asLocale = (value: string): Locale => SUPPORTED_LOCALES.find((code) => code === value) ?? SUPPORTED_LOCALES[0]
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card px-5 py-4 sm:px-6" data-testid="careers-languages">
    <div class="grid gap-1.5">
      <p id="cp-editing-label" class="text-sm font-medium">{{ t('careersEditor.languages.editing') }}</p>
      <div role="group" aria-labelledby="cp-editing-label" class="inline-flex w-fit rounded-md border bg-background p-0.5">
        <button
          v-for="code in SUPPORTED_LOCALES"
          :key="code"
          type="button"
          :aria-pressed="editing === code"
          class="h-7 rounded-[0.375rem] px-3 text-xs font-medium outline-none transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35"
          :class="editing === code ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'"
          :data-testid="`careers-editing-locale-${code}`"
          @click="editing = code"
        >
          {{ t(`locales.${code}`) }}
        </button>
      </div>
    </div>
    <div class="grid min-w-48 gap-1.5">
      <Label for="cp-default-locale">{{ t('careersEditor.languages.default') }}</Label>
      <NativeSelect id="cp-default-locale" :model-value="defaultLocale" aria-describedby="cp-default-locale-hint" data-testid="careers-field-default-locale" @update:model-value="emit('default', asLocale($event))">
        <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">{{ t(`locales.${code}`) }}</option>
      </NativeSelect>
      <p id="cp-default-locale-hint" class="sr-only">{{ t('careersEditor.languages.defaultHint') }}</p>
    </div>
  </div>
</template>
