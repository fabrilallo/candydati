<script setup lang="ts">
import { SUPPORTED_LOCALES } from '@tt/domain'

const { t, locale, setLocale } = useI18n()
</script>

<template>
  <div role="group" :aria-label="t('common.language')" class="inline-flex items-center text-xs font-medium">
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      :aria-pressed="locale === code"
      :lang="code"
      :title="t(`locales.${code}`)"
      class="h-8 rounded-md px-2 uppercase tracking-wide transition-colors duration-150"
      :class="locale === code ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'"
      @click="setLocale(code)"
    >
      {{ code }}
    </button>
  </div>
</template>
