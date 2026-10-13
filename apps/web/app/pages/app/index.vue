<script setup lang="ts">
import { FileTextIcon, PlusIcon, UserPlusIcon } from '@lucide/vue'
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
</script>

<template>
  <div class="grid gap-8">
    <PageHeader :title="t('dashboard.welcome', { name: viewer?.user.name ?? '' })" :description="t('dashboard.subtitle', { organization: viewer?.organization?.name ?? '' })">
      <template #actions>
        <Button v-if="can(role, 'invitation:create')" variant="ghost" class="hidden sm:inline-flex" as-child>
          <NuxtLink to="/app/settings/members"><UserPlusIcon aria-hidden="true" />{{ t('dashboard.invite') }}</NuxtLink>
        </Button>
        <Button v-if="can(role, 'job_template:read')" variant="outline" as-child>
          <NuxtLink to="/app/jobs/templates"><FileTextIcon aria-hidden="true" />{{ t('job.list.templates') }}</NuxtLink>
        </Button>
        <Button v-if="can(role, 'job:create')" as-child>
          <NuxtLink to="/app/jobs/new"><PlusIcon aria-hidden="true" />{{ t('dashboard.newJob') }}</NuxtLink>
        </Button>
      </template>
    </PageHeader>
    <JobsOverview
      v-if="can(role, 'job:read')"
      :careers-path="publicPath"
      :can-create="can(role, 'job:create')"
      :can-invite="can(role, 'invitation:create')"
    />
    <section v-else class="grid gap-1 rounded-xl border bg-card px-6 py-6">
      <h2 class="text-[0.9375rem] font-semibold">{{ t('dashboard.teamTitle') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('dashboard.teamBody') }}</p>
      <NuxtLink to="/app/settings/members" class="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">{{ t('nav.members') }}</NuxtLink>
    </section>
  </div>
</template>
