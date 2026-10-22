<script setup lang="ts">
import { ExternalLinkIcon, FileStackIcon, PlusIcon, UserPlusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { careersPath } from '@/lib/job-view'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
useSeoMeta({ title: () => t('dashboard.title') })
const role = computed(() => viewer.value?.role ?? null)
const slug = computed(() => viewer.value?.organization?.slug ?? null)
const publicPath = computed(() => (slug.value ? careersPath(slug.value) : null))
const firstName = computed(() => viewer.value?.user.name.split(' ')[0] ?? '')
</script>

<template>
  <AppPage :crumbs="[{ label: viewer?.organization?.name ?? '', to: '/app' }, { label: t('dashboard.title') }]" wide>
    <template #actions>
      <Button v-if="publicPath" as-child variant="ghost" size="sm">
        <a :href="publicPath" target="_blank" rel="noopener"><ExternalLinkIcon aria-hidden="true" />{{ t('shell.careersPage') }}</a>
      </Button>
      <Button v-if="can(role, 'invitation:create')" as-child variant="ghost" size="sm" class="max-sm:hidden">
        <NuxtLink to="/app/settings/members"><UserPlusIcon aria-hidden="true" />{{ t('dashboard.invite') }}</NuxtLink>
      </Button>
    </template>
    <div class="grid gap-8">
      <PageHeader :title="t('dashboard.welcome', { name: firstName })" :description="t('dashboard.subtitle', { organization: viewer?.organization?.name ?? '' })">
        <template #actions>
          <Button v-if="can(role, 'job_template:read')" variant="outline" as-child>
            <NuxtLink to="/app/jobs/templates"><FileStackIcon aria-hidden="true" />{{ t('job.list.templates') }}</NuxtLink>
          </Button>
          <Button v-if="can(role, 'job:create')" as-child>
            <NuxtLink to="/app/jobs/new"><PlusIcon aria-hidden="true" />{{ t('dashboard.newJob') }}</NuxtLink>
          </Button>
        </template>
      </PageHeader>
      <PrivacyMissingBanner v-if="can(role, 'privacy:manage')" />
      <DashboardOverview v-if="can(role, 'job:read')" :can-create="can(role, 'job:create')" />
      <section v-else class="grid gap-1 rounded-xl border bg-card px-6 py-6">
        <h2 class="text-[0.9375rem] font-semibold">{{ t('dashboard.teamTitle') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('dashboard.teamBody') }}</p>
        <NuxtLink to="/app/settings/members" class="mt-2 text-sm font-medium text-link underline-offset-4 hover:underline">{{ t('nav.members') }}</NuxtLink>
      </section>
    </div>
  </AppPage>
</template>
