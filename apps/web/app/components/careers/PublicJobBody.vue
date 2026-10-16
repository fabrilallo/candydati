<script setup lang="ts">
import { ArrowDownIcon, ArrowLeftIcon } from '@lucide/vue'
import type { PublicJobPage } from '@candydati/domain'
import { careersPath } from '@/lib/job-view'
import { Button } from '@/components/ui/button'

/**
 * Public ad page: the shared candidate-facing rendering, the way to apply (once the organization has a privacy
 * notice), and the way back to every open position.
 */
const props = defineProps<{ page: PublicJobPage }>()
const lang = props.page.job.content.language
// Loads the messages of the ad's language: everything here reads in it, whatever the visitor's locale.
const x = await useAdTranslate(lang)
const back = computed(() => careersPath(props.page.organization.slug))
const apply = ref<{ reveal: () => Promise<void> } | null>(null)
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
    <JobAdView :content="page.job.content" :organization="page.organization" mode="public" :published-at="page.job.publishedAt">
      <template #cta>
        <div v-if="page.privacyNotice" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="lg" data-testid="apply-cta" @click="apply?.reveal()">{{ x('apply.open') }}<ArrowDownIcon aria-hidden="true" /></Button>
          <p class="text-sm text-muted-foreground">{{ x('apply.ctaHint') }}</p>
        </div>
        <p v-else class="rounded-lg border border-dashed border-input px-4 py-3 text-sm text-muted-foreground" data-testid="apply-not-open">{{ x('apply.notOpen') }}</p>
      </template>
    </JobAdView>
    <ApplySection
      v-if="page.privacyNotice"
      ref="apply"
      :org="page.organization.slug"
      :job="page.job.slug"
      :title="page.job.content.title"
      :organization="page.organization.name"
      :language="lang"
      :response-days="page.job.content.responseDays"
      :notice="page.privacyNotice"
    />
    <footer class="border-t pt-6">
      <NuxtLink :to="back" :lang="lang" class="text-sm font-medium text-primary underline-offset-4 hover:underline">{{ x('public.backToJobs') }}</NuxtLink>
    </footer>
  </div>
</template>
