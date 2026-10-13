<script setup lang="ts">
import { SUPPORTED_LOCALES } from '@tt/domain'

const { t, locale, setLocale } = useI18n()
</script>

<template>
  <div role="group" :aria-label="t('common.language')" class="inline-flex rounded-md border bg-card p-0.5 text-xs font-medium">
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      :aria-pressed="locale === code"
      :lang="code"
      :title="t(`locales.${code}`)"
      class="rounded-[5px] px-2 py-1 uppercase tracking-wide transition-colors"
      :class="locale === code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
      @click="setLocale(code)"
    >
      {{ code }}
    </button>
  </div>
</template>
