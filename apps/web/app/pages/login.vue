<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
useSeoMeta({ title: () => t('auth.login.title') })
const signupLink = computed(() => (typeof route.query.redirect === 'string' ? { path: '/signup', query: { redirect: route.query.redirect } } : '/signup'))
</script>

<template>
  <div class="grid gap-6">
    <div class="grid gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('auth.login.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('auth.login.subtitle') }}</p>
    </div>
    <AuthForm mode="login" />
    <p class="text-sm text-muted-foreground">
      {{ t('auth.login.noAccount') }}
      <NuxtLink :to="signupLink" rel="nofollow" class="font-medium text-foreground underline underline-offset-4">{{ t('auth.login.signupLink') }}</NuxtLink>
    </p>
  </div>
</template>
