<script setup lang="ts">
import { toast } from 'vue-sonner'
import { LINKEDIN_MAX_PER_RUN_CEILING } from '@candydati/domain'
import { errorKeyOf } from '@/lib/auth-errors'
import { loaded } from '@/lib/job-api'
import { can } from '@/lib/permissions-ui'
import { getLinkedinStatus, setLinkedinSetting } from '@/lib/sourcing-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Whether the assistant may read LinkedIn through members' browsers, and the most profiles per search (owners and admins). */
const { t } = useI18n()
const request = useJobsApi()
const { viewer } = useViewer()
const canEdit = computed(() => can(viewer.value?.role ?? null, 'organization:update'))
const { data } = useFreshAsyncData('linkedin-setting', () => loaded(() => getLinkedinStatus(request)))
const enabled = ref(false)
const max = ref('20')
watch(
  () => data.value?.data,
  (status) => {
    if (!status) return
    enabled.value = status.enabled
    max.value = String(status.maxProfilesPerRun)
  },
  { immediate: true },
)
const saving = ref(false)
const save = async (): Promise<void> => {
  const parsed = Number.parseInt(max.value, 10)
  const maxProfilesPerRun = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), LINKEDIN_MAX_PER_RUN_CEILING) : 20
  saving.value = true
  try {
    const saved = await setLinkedinSetting(request, { enabled: enabled.value, maxProfilesPerRun })
    enabled.value = saved.enabled
    max.value = String(saved.maxProfilesPerRun)
    toast.success(t('linkedinSetting.saved'))
  } catch (error) {
    toast.error(t(errorKeyOf(error)))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="grid gap-3 rounded-xl panel px-5 py-4 sm:px-6" aria-labelledby="linkedin-setting" data-testid="linkedin-setting">
    <h2 id="linkedin-setting" class="text-base font-semibold tracking-tight">{{ t('linkedinSetting.title') }}</h2>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('linkedinSetting.explain') }}</p>
    <FormAlert v-if="data?.errorKey" :message-key="data.errorKey" />
    <template v-else-if="data?.data">
      <label class="flex items-start gap-3 text-sm font-medium">
        <input v-model="enabled" type="checkbox" role="switch" class="mt-0.5 size-4 shrink-0 accent-primary" :disabled="!canEdit || saving" data-testid="linkedin-toggle">
        <span>{{ t('linkedinSetting.enable') }}</span>
      </label>
      <div class="flex flex-wrap items-end gap-3 pl-7">
        <FormField id="linkedin-max" :label="t('linkedinSetting.max')">
          <Input id="linkedin-max" v-model="max" type="number" min="1" :max="LINKEDIN_MAX_PER_RUN_CEILING" class="w-28" :disabled="!canEdit || saving" data-testid="linkedin-max" />
        </FormField>
        <Button v-if="canEdit" variant="outline" size="sm" :disabled="saving" data-testid="linkedin-save" @click="save">{{ t('automationPacks.form.save') }}</Button>
      </div>
      <p v-if="!canEdit" class="pl-7 text-xs text-muted-foreground">{{ t('linkedinSetting.adminOnly') }}</p>
    </template>
  </section>
</template>
