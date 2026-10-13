<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
useSeoMeta({ title: () => t('auth.signup.title') })
const loginLink = computed(() => (typeof route.query.redirect === 'string' ? { path: '/login', query: { redirect: route.query.redirect } } : '/login'))
</script>

<template>
  <div class="grid gap-6">
    <div class="grid gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('auth.signup.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('auth.signup.subtitle') }}</p>
    </div>
    <AuthForm mode="signup" />
    <p class="text-sm text-muted-foreground">
      {{ t('auth.signup.hasAccount') }}
      <NuxtLink :to="loginLink" rel="nofollow" class="font-medium text-foreground underline underline-offset-4">{{ t('auth.signup.loginLink') }}</NuxtLink>
    </p>
  </div>
</template>
