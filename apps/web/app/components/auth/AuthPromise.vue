<script setup lang="ts">
/** The product's promise, set large next to the auth forms: the three principles candidates can count on. */
const { t } = useI18n()
const platform = usePlatform()
const principles = ['salary', 'process', 'answer'] as const
</script>

<template>
  <section :aria-label="t('promise.label')" class="flex h-full flex-col justify-between gap-12 rounded-xl bg-inverse p-10 text-inverse-foreground dark:border xl:p-14">
    <p class="text-sm font-medium text-inverse-muted">{{ t('promise.lead', { name: platform.name }) }}</p>
    <ol class="grid gap-10">
      <li v-for="(key, index) in principles" :key="key" class="grid grid-cols-[2.5rem_1fr] gap-x-4">
        <span class="figure pt-2 text-sm font-medium text-inverse-accent" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="grid gap-2">
          <h2 class="text-3xl font-semibold leading-[1.1] tracking-tight xl:text-4xl">{{ t(`promise.${key}.title`) }}</h2>
          <p class="max-w-md text-[0.9375rem] leading-relaxed text-inverse-muted">{{ t(`promise.${key}.body`) }}</p>
        </div>
      </li>
    </ol>
    <p class="max-w-md text-sm leading-relaxed text-inverse-muted">{{ t('promise.footer') }}</p>
  </section>
</template>
