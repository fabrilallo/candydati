<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
useSeoMeta({ title: () => t('auth.signup.title') })
const loginLink = computed(() => (typeof route.query.redirect === 'string' ? { path: '/login', query: { redirect: route.query.redirect } } : '/login'))
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-2">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.signup.title') }}</h1>
      <p class="text-[0.9375rem] text-muted-foreground">{{ t('auth.signup.subtitle') }}</p>
    </div>
    <AuthForm mode="signup" />
    <p class="border-t pt-6 text-sm text-muted-foreground">
      {{ t('auth.signup.hasAccount') }}
      <NuxtLink :to="loginLink" rel="nofollow" class="font-medium text-primary underline-offset-4 hover:underline">{{ t('auth.signup.loginLink') }}</NuxtLink>
    </p>
  </div>
</template>
