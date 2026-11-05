<script setup lang="ts">
import { TagsIcon } from '@lucide/vue'
import { can } from '@/lib/permissions-ui'

definePageMeta({ layout: 'app' })
const { t } = useI18n()
const { viewer } = useViewer()
const allowed = computed(() => can(viewer.value?.role ?? null, 'skill_alias:manage'))
useSeoMeta({ title: () => t('skills.title') })
</script>

<template>
  <AppPage :crumbs="[{ label: t('nav.sections.organization') }, { label: t('skills.title') }]">
    <div class="grid gap-8">
      <PageHeader :title="t('skills.title')" :description="t('skills.description')" :icon="TagsIcon" />
      <SkillAliasesPanel v-if="allowed" />
      <FormAlert v-else message-key="errors.forbidden" />
    </div>
  </AppPage>
</template>
