<script setup lang="ts">
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const id = computed(() => String(route.params.id))
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))
useSeoMeta({ title: () => t('candidate.sheet.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.candidates'), to: '/app/candidates' }, { label: t('candidate.sheet.title') }]">
    <div class="mx-auto grid w-full max-w-3xl">
      <CandidateDetailView v-if="allowed" :key="id" :candidate-id="id" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
