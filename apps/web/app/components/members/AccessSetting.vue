<script setup lang="ts">
/**
 * "I recruiter vedono solo gli annunci del loro team": a switch for owners and admins, with one sentence on what the
 * current choice means (PRODUCT.md §6). Saves on change; the screen shows the answer of the api.
 */
const { t } = useI18n()
const setting = useAccessSetting()
const toggle = (event: Event): void => {
  void setting.change((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="grid gap-2 rounded-xl border bg-card px-5 py-4 shadow-xs sm:px-6" aria-labelledby="access-setting" data-testid="access-setting">
    <h2 id="access-setting" class="text-base font-semibold tracking-tight">{{ t('members.access.title') }}</h2>
    <FormAlert v-if="setting.errorKey.value" message-key="members.access.loadFailed" />
    <template v-else-if="setting.value.value !== null">
      <label class="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :checked="setting.value.value" :disabled="setting.saving.value" data-testid="access-toggle" @change="toggle">
        <span>{{ t('members.access.label') }}</span>
      </label>
      <p class="pl-7 text-sm text-pretty text-muted-foreground" data-testid="access-explain">{{ t(setting.value.value ? 'members.access.on' : 'members.access.off') }}</p>
    </template>
  </section>
</template>
