<script setup lang="ts">
import { fetchPublicJob } from '@/lib/job-api'
import { buildJobSeo } from '@/lib/job-seo'
import { failureStatus, loadPublic } from '@/lib/public-load'

definePageMeta({ layout: 'public' })
const route = useRoute()
const config = useRuntimeConfig()
const api = useJobsApi()
const org = String(route.params.org)
const jobSlug = String(route.params.job)

const { data } = await useAsyncData(`careers-${org}-${jobSlug}`, () => loadPublic(() => fetchPublicJob(api, org, jobSlug)))
const status = data.value ? failureStatus(data.value) : 503
if (status !== null || data.value?.kind !== 'ok') {
  throw createError({ statusCode: status ?? 503, statusMessage: status === 404 ? 'Not Found' : 'Service Unavailable', fatal: true })
}
const page = data.value.data
const cacheControl = useResponseHeader('cache-control')
cacheControl.value = 'public, s-maxage=60, stale-while-revalidate=300'

// Head texts (description fallback, JSON-LD headings) are written in the language of the ad.
const seo = buildJobSeo(page, config.public.siteUrl, await useAdTranslate(page.job.content.language))
useSeoMeta({
  title: seo.title,
  description: seo.description,
  robots: 'index, follow',
  ogTitle: seo.title,
  ogDescription: seo.description,
  ogUrl: seo.canonical,
  ogType: 'website',
  ogLocale: seo.locale === 'it' ? 'it_IT' : 'en_GB',
  ogImage: seo.image,
  twitterCard: 'summary',
})
useHead({
  htmlAttrs: { lang: seo.locale },
  titleTemplate: (value) => value ?? '',
  link: [{ rel: 'canonical', href: seo.canonical }],
  script: [{ type: 'application/ld+json', innerHTML: seo.jsonLd }],
})
</script>

<template>
  <PublicJobBody :page="page" />
</template>
