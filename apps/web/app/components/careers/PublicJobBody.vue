<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue'
import type { PublicJobPageDto } from '@tt/domain'
import { careersPath } from '@/lib/job-view'

/** Public ad page: the shared candidate-facing rendering, plus the way back to every open position. */
const props = defineProps<{ page: PublicJobPageDto }>()
const lang = props.page.job.content.language
// Loads the messages of the ad's language: everything here reads in it, whatever the visitor's locale.
const x = await useAdTranslate(lang)
const back = computed(() => careersPath(props.page.organization.slug))
</script>

<template>
  <div class="grid gap-8" data-testid="public-job">
    <NuxtLink
      :to="back"
      :lang="lang"
      class="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors duration-150 ease-snap hover:text-foreground"
      data-testid="back-to-jobs"
    >
      <ArrowLeftIcon class="size-4" aria-hidden="true" />
      {{ x('public.backToJobs') }}
    </NuxtLink>
    <JobAdView :content="page.job.content" :organization="page.organization" mode="public" :published-at="page.job.publishedAt" />
    <footer class="border-t pt-6">
      <NuxtLink :to="back" :lang="lang" class="text-sm font-medium text-primary underline-offset-4 hover:underline">{{ x('public.backToJobs') }}</NuxtLink>
    </footer>
  </div>
</template>
