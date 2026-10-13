<script setup lang="ts">
definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
useSeoMeta({ title: () => t('jobRequests.title') })
const id = computed(() => String(route.params.id))
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.work'), to: '/app' }, { label: t('jobRequests.title'), to: '/app/job-requests' }, { label: t('jobRequests.detail.crumb') }]">
    <JobRequestDetail :id="id" />
  </AppPage>
</template>
