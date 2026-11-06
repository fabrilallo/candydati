<script setup lang="ts">
import { CircleCheckIcon, ExternalLinkIcon, InfoIcon, UserPlusIcon } from '@lucide/vue'
import { safeExternalUrl } from '@/lib/safe-url'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

/**
 * The person saved with the extension's button on LinkedIn: who (name, headline, city, profile link), which open
 * position, optional facts per criterion, then "Add as contact". Nothing is sent before that click.
 */
const { t } = useI18n()
const platform = usePlatform()
const extensionUrl = useRuntimeConfig().public.extensionUrl
const saving = useLinkedinSave()
const jobId = ref('')
const evidence = ref('')
const jobError = ref<string | null>(null)
const outcomeKind = computed(() => (saving.result.value?.outcome === 'added' ? 'success' : 'info'))

onMounted(() => void saving.load())

const submit = (): void => {
  jobError.value = jobId.value === '' ? 'linkedinSave.errors.job' : null
  if (!jobError.value) void saving.save(jobId.value, evidence.value)
}
</script>

<template>
  <div class="grid gap-6" data-testid="linkedin-save-panel">
    <div v-if="saving.state.value === 'loading'" class="grid gap-4" aria-busy="true"><Skeleton class="h-40 w-full" /></div>
    <section v-else-if="saving.state.value !== 'ready'" class="grid gap-3 rounded-xl panel px-6 py-8 sm:px-8" :data-testid="`linkedin-save-${saving.state.value}`">
      <h2 class="text-lg font-semibold tracking-tight">{{ t(`linkedinSave.states.${saving.state.value}.title`) }}</h2>
      <p class="max-w-xl text-[0.9375rem] text-muted-foreground">{{ t(`linkedinSave.states.${saving.state.value}.body`, { name: platform.name }) }}</p>
      <a v-if="saving.state.value === 'extension_missing' && safeExternalUrl(extensionUrl)" :href="safeExternalUrl(extensionUrl) ?? undefined" target="_blank" rel="noopener noreferrer" class="w-fit text-sm text-link underline-offset-4 hover:underline">{{ t('linkedinSave.install') }}</a>
    </section>
    <template v-else-if="saving.profile.value">
      <section class="grid gap-1 rounded-xl panel px-6 py-5 sm:px-8" data-testid="linkedin-save-person">
        <h2 class="text-lg font-semibold tracking-tight" data-testid="linkedin-save-name">{{ saving.profile.value.fullName }}</h2>
        <p v-if="saving.profile.value.headline" class="text-sm">{{ saving.profile.value.headline }}</p>
        <p v-if="saving.profile.value.location" class="text-sm text-muted-foreground">{{ saving.profile.value.location }}</p>
        <a v-if="safeExternalUrl(saving.profile.value.profileUrl)" :href="safeExternalUrl(saving.profile.value.profileUrl) ?? undefined" target="_blank" rel="noopener noreferrer nofollow" class="mt-1 inline-flex w-fit items-center gap-1 text-sm text-link underline-offset-4 hover:underline" data-testid="linkedin-save-profile">
          {{ t('sourcing.openProfile') }}<ExternalLinkIcon class="size-3.5" aria-hidden="true" />
        </a>
      </section>
      <section v-if="saving.result.value" class="grid gap-3 rounded-xl border bg-muted px-6 py-5 sm:px-8" role="status" data-testid="linkedin-save-result">
        <p class="flex items-start gap-2.5 font-medium">
          <CircleCheckIcon v-if="outcomeKind === 'success'" class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <InfoIcon v-else class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ t(`sourcing.outcomes.${saving.result.value.outcome}`) }}
        </p>
        <NuxtLink :to="`/app/jobs/${encodeURIComponent(saving.result.value.jobId)}/sourcing`" class="w-fit text-sm text-link underline-offset-4 hover:underline" data-testid="linkedin-save-open-job">{{ t('linkedinSave.openContacts') }}</NuxtLink>
      </section>
      <form v-else id="linkedin-save-form" class="grid gap-4" novalidate @submit.prevent="submit">
        <p v-if="saving.jobs.value.length === 0 && !saving.errorKey.value" class="text-sm text-muted-foreground" data-testid="linkedin-save-no-jobs">{{ t('linkedinSave.noJobs') }}</p>
        <FormField v-else id="linkedin-save-job" :label="t('linkedinSave.job')" :error="jobError ?? undefined">
          <template #default="{ invalid, describedBy }">
            <NativeSelect id="linkedin-save-job" v-model="jobId" :aria-invalid="invalid || undefined" :aria-describedby="describedBy" data-testid="linkedin-save-job">
              <option value="" disabled>{{ t('linkedinSave.jobPlaceholder') }}</option>
              <option v-for="job in saving.jobs.value" :key="job.id" :value="job.id">{{ job.title || t('job.editor.untitled') }}</option>
            </NativeSelect>
          </template>
        </FormField>
        <FormField id="linkedin-save-evidence" :label="t('sourcing.add.evidence')" :hint="t('sourcing.add.evidenceHint')">
          <Textarea id="linkedin-save-evidence" v-model="evidence" rows="3" data-testid="linkedin-save-evidence" />
        </FormField>
        <FormAlert :message-key="saving.errorKey.value" />
        <div>
          <Button type="submit" :disabled="saving.busy.value || saving.jobs.value.length === 0" data-testid="linkedin-save-submit"><UserPlusIcon aria-hidden="true" />{{ t('linkedinSave.save') }}</Button>
        </div>
      </form>
    </template>
  </div>
</template>
