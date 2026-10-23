<script setup lang="ts">
/**
 * "Richiedi l'approvazione prima di pubblicare": a switch for owners and admins, with one sentence on what the
 * current choice means. Saves on change; the screen shows the answer of the api, not what was clicked.
 */
const { t } = useI18n()
const setting = useApprovalSetting()
const toggle = (event: Event): void => {
  void setting.change((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <section class="grid gap-2 rounded-xl panel px-5 py-4 sm:px-6" aria-labelledby="approval-setting" data-testid="approval-setting">
    <h2 id="approval-setting" class="sr-only">{{ t('jobRequests.settings.title') }}</h2>
    <FormAlert v-if="setting.errorKey.value" message-key="jobRequests.settings.loadFailed" />
    <template v-else-if="setting.value.value !== null">
      <label class="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :checked="setting.value.value" :disabled="setting.saving.value" data-testid="approval-toggle" @change="toggle">
        <span>{{ t('jobRequests.settings.label') }}</span>
      </label>
      <p class="pl-7 text-sm text-pretty text-muted-foreground" data-testid="approval-explain">{{ t(setting.value.value ? 'jobRequests.settings.on' : 'jobRequests.settings.off') }}</p>
    </template>
  </section>
</template>
