<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
useSeoMeta({ title: () => t('auth.login.title') })
const signupLink = computed(() => (typeof route.query.redirect === 'string' ? { path: '/signup', query: { redirect: route.query.redirect } } : '/signup'))
</script>

<template>
  <div class="grid gap-8">
    <div class="grid gap-2">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('auth.login.title') }}</h1>
      <p class="text-[0.9375rem] text-muted-foreground">{{ t('auth.login.subtitle') }}</p>
    </div>
    <AuthForm mode="login" />
    <p class="border-t pt-6 text-sm text-muted-foreground">
      {{ t('auth.login.noAccount') }}
      <NuxtLink :to="signupLink" rel="nofollow" class="font-medium text-primary underline-offset-4 hover:underline">{{ t('auth.login.signupLink') }}</NuxtLink>
    </p>
  </div>
</template>
