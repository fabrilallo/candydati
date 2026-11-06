<script setup lang="ts">
/**
 * How the people the organization sources are told (GDPR art. 14): by default with the first message, and erased within
 * 30 days when never written to; the switch also emails the notice at once when the address is known.
 */
const { t } = useI18n()
const setting = useSourcingSetting()
const toggle = (event: Event): void => {
  void setting.change((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="grid gap-2 rounded-xl panel px-5 py-4 sm:px-6" aria-labelledby="sourcing-setting" data-testid="sourcing-setting">
    <h2 id="sourcing-setting" class="text-base font-semibold tracking-tight">{{ t('sourcingSetting.title') }}</h2>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('sourcingSetting.always') }}</p>
    <FormAlert v-if="setting.errorKey.value" message-key="sourcingSetting.loadFailed" />
    <template v-else-if="setting.value.value !== null">
      <label class="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :checked="setting.value.value" :disabled="setting.saving.value" data-testid="sourcing-email-toggle" @change="toggle">
        <span>{{ t('sourcingSetting.label') }}</span>
      </label>
      <p class="pl-7 text-sm text-pretty text-muted-foreground" data-testid="sourcing-email-explain">{{ t(setting.value.value ? 'sourcingSetting.on' : 'sourcingSetting.off') }}</p>
    </template>
  </section>
</template>
