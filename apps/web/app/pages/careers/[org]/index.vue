<script setup lang="ts">
import { defaultCareersPage, type PublicCareersPageDto } from '@tt/domain'
import { fetchPublicCareersPage } from '@/lib/careers-page-api'
import { careersPageSeo } from '@/lib/careers-seo'
import { fetchCareers } from '@/lib/job-api'
import { absoluteUrl, careersPath } from '@/lib/job-view'
import { failureStatus, loadPublic } from '@/lib/public-load'

definePageMeta({ layout: 'careers' })
const { t, locale } = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const api = useJobsApi()
const org = String(route.params.org)

// The positions decide whether the page exists; the page document only dresses it. If the document cannot be read,
// the default page (name and positions) is shown rather than an error.
const { data } = await useAsyncData(`careers-${org}`, async () => {
  const [careers, site] = await Promise.all([loadPublic(() => fetchCareers(api, org)), loadPublic(() => fetchPublicCareersPage(api, org))])
  return { careers, site }
})
const status = data.value ? failureStatus(data.value.careers) : 503
if (status !== null || data.value?.careers.kind !== 'ok') {
  throw createError({ statusCode: status ?? 503, statusMessage: status === 404 ? 'Not Found' : 'Service Unavailable', fatal: true })
}
const careers = data.value.careers.data
const fallback = (): PublicCareersPageDto => ({ organization: careers.organization, page: defaultCareersPage(careers.organization.name), media: {}, publishedAt: null })
const site: PublicCareersPageDto = data.value.site.kind === 'ok' ? data.value.site.data : fallback()

// Public and identical for everyone: let the CDN keep it briefly (errors are never cached, they throw above).
const cacheControl = useResponseHeader('cache-control')
cacheControl.value = 'public, s-maxage=60, stale-while-revalidate=300'

const canonical = absoluteUrl(config.public.siteUrl, careersPath(careers.organization.slug))
const seo = computed(() =>
  careersPageSeo(site, {
    locale: locale.value as 'it' | 'en',
    siteUrl: config.public.siteUrl,
    fallbackTitle: t('careers.title', { organization: careers.organization.name }),
    fallbackDescription: t('careers.metaDescription', { organization: careers.organization.name }),
  }),
)
useSeoMeta({
  title: () => seo.value.title,
  description: () => seo.value.description,
  robots: 'index, follow',
  ogTitle: () => seo.value.title,
  ogDescription: () => seo.value.description,
  ogUrl: canonical,
  ogType: 'website',
  ogImage: () => seo.value.image ?? careers.organization.logo,
  twitterCard: () => (seo.value.image ? 'summary_large_image' : 'summary'),
})
useHead({
  titleTemplate: (value) => value ?? '',
  link: [{ rel: 'canonical', href: canonical }],
  script: [{ type: 'application/ld+json', innerHTML: () => seo.value.jsonLd }],
})
</script>

<template>
  <CareersSite v-if="data?.careers.kind === 'ok'" :page="site.page" :media="site.media" :careers="careers" />
</template>
