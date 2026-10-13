<script setup lang="ts">
import { DownloadIcon } from '@lucide/vue'
import { candidateExportUrl } from '@/lib/gdpr-api'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const route = useRoute()
const { viewer } = useViewer()
const id = computed(() => String(route.params.id))
/** A link from a notification or the attention list names the application to show first. */
const applicationId = computed(() => (typeof route.query.application === 'string' ? route.query.application : null))
/** Opened from a job's pipeline: the job, so a person still to reconfirm stays visible. */
const viaJobId = computed(() => (typeof route.query.viaJobId === 'string' ? route.query.viaJobId : null))
const allowed = computed(() => can(viewer.value?.role ?? null, 'candidate:read'))
const canExport = computed(() => can(viewer.value?.role ?? null, 'candidate:export'))
useSeoMeta({ title: () => t('candidate.sheet.title') })
/** Nothing is left to show: back to the list (the toast already said what happened). */
const erased = async (candidateGone: boolean): Promise<void> => {
  if (candidateGone) await navigateTo('/app/candidates', { replace: true })
}
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.candidates'), to: '/app/candidates' }, { label: t('candidate.sheet.title') }]">
    <template v-if="allowed && canExport" #actions>
      <Button as-child variant="ghost" size="sm">
        <a :href="candidateExportUrl(id)" download data-testid="topbar-export"><DownloadIcon aria-hidden="true" />{{ t('gdpr.rights.export.title') }}</a>
      </Button>
    </template>
    <div class="mx-auto grid w-full max-w-3xl">
      <CandidateDetailView v-if="allowed" :key="id" :candidate-id="id" :application-id="applicationId" :via-job-id="viaJobId" @erased="erased" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
