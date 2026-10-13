<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '@/components/ui/button'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const messageKey = computed(() => (props.error.statusCode === 503 ? 'errors.unreachable' : props.error.statusCode === 404 ? 'errors.notFound' : 'errors.generic'))
const reset = (): Promise<void> => clearError({ redirect: '/' })
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
    <p class="text-sm font-medium text-muted-foreground">{{ error.statusCode }}</p>
    <h1 class="text-xl font-semibold tracking-tight">{{ t(messageKey) }}</h1>
    <div><Button @click="reset">{{ t('common.retry') }}</Button></div>
  </main>
</template>
