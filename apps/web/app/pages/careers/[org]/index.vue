<script setup lang="ts">
import { fetchCareers } from '@/lib/job-api'
import { absoluteUrl, careersPath } from '@/lib/job-view'
import { failureStatus, loadPublic } from '@/lib/public-load'

definePageMeta({ layout: 'public' })
const { t } = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const api = useJobsApi()
const org = String(route.params.org)

const { data } = await useAsyncData(`careers-${org}`, () => loadPublic(() => fetchCareers(api, org)))
const status = data.value ? failureStatus(data.value) : 503
if (status !== null || data.value?.kind !== 'ok') {
  throw createError({ statusCode: status ?? 503, statusMessage: status === 404 ? 'Not Found' : 'Service Unavailable', fatal: true })
}
const careers = data.value.data
// Public and identical for everyone: let the CDN keep it briefly (errors are never cached, they throw above).
const cacheControl = useResponseHeader('cache-control')
cacheControl.value = 'public, s-maxage=60, stale-while-revalidate=300'

const title = t('careers.title', { organization: careers.organization.name })
const description = t('careers.metaDescription', { organization: careers.organization.name })
const canonical = absoluteUrl(config.public.siteUrl, careersPath(careers.organization.slug))
useSeoMeta({ title, description, robots: 'index, follow', ogTitle: title, ogDescription: description, ogUrl: canonical, ogType: 'website', ogImage: careers.organization.logo, twitterCard: 'summary' })
useHead({ titleTemplate: (value) => value ?? '', link: [{ rel: 'canonical', href: canonical }] })
</script>

<template>
  <CareersList :careers="careers" />
</template>
