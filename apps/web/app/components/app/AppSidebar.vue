<script setup lang="ts">
const { t } = useI18n()
const platform = usePlatform()
const { viewer } = useViewer()
const roleLabel = computed(() => (viewer.value?.role ? t(`roles.${viewer.value.role}`) : ''))
</script>

<template>
  <div class="flex h-full flex-col gap-6 px-3 pt-4 pb-3">
    <NuxtLink to="/app" class="flex h-8 items-center gap-2.5 self-start rounded-md px-2 text-[0.9375rem] font-semibold tracking-tight">
      <span class="grid size-6 place-items-center rounded-[6px] bg-primary text-xs font-bold text-primary-foreground" aria-hidden="true">{{ platform.name.charAt(0).toUpperCase() }}</span>
      {{ platform.name }}
    </NuxtLink>
    <OrgSwitcher v-if="viewer?.organization" :organization="viewer.organization" :role-label="roleLabel" />
    <AppNav :role="viewer?.role ?? null" class="flex-1" />
    <div class="border-t pt-3">
      <UserMenu v-if="viewer" :name="viewer.user.name" :email="viewer.user.email" :role="viewer.role" />
    </div>
  </div>
</template>
