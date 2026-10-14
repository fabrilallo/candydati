<script setup lang="ts">
import { pipelineStagesOf, type JobDto } from '@tt/domain'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { stageName } from '@/lib/pipeline-board'
import { can } from '@/lib/permissions-ui'
import { JOB_TEAM_ROLES, type JobTeamRole } from '@/lib/job-team-api'

/**
 * "Team": the people who see this job's candidates. Owners and admins (and recruiters, unless the organization restricts
 * them) see every job anyway; hiring managers and interviewers see only the jobs whose team they are on.
 */
const props = defineProps<{ job: JobDto }>()
const { t } = useI18n()
const { viewer } = useViewer()
const team = useJobTeam(props.job.id)
const canManage = computed(() => can(viewer.value?.role ?? null, 'job_team:manage'))
const stages = computed(() => pipelineStagesOf(props.job.content.process))
const stageNamesOf = (ids: readonly string[]): readonly string[] =>
  ids.flatMap((id) => {
    const stage = stages.value.find((s) => s.id === id)
    return stage ? [stageName(stage, t)] : []
  })

const chosen = ref('')
const role = ref<JobTeamRole>('interviewer')
const isRole = (value: string): value is JobTeamRole => (JOB_TEAM_ROLES as readonly string[]).includes(value)
const pickRole = (value: string): void => {
  if (isRole(value)) role.value = value
}
const add = async (): Promise<void> => {
  if (!chosen.value) return
  if (await team.put(chosen.value, role.value)) chosen.value = ''
}
</script>

<template>
  <div class="grid gap-6">
    <p class="max-w-2xl text-sm text-pretty text-muted-foreground">{{ t('jobTeam.explain') }}</p>
    <div v-if="team.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="team.errorKey.value" />
      <div><Button variant="outline" @click="() => team.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <template v-else-if="team.loaded.value">
      <section class="rounded-xl border bg-card shadow-xs" aria-labelledby="team-title">
        <h2 id="team-title" class="border-b px-5 py-3 text-base font-semibold tracking-tight sm:px-6">
          {{ t('jobTeam.listTitle') }}
          <span class="figure ml-1 text-sm font-normal text-muted-foreground">{{ team.members.value.length }}</span>
        </h2>
        <p v-if="!team.members.value.length" class="px-5 py-4 text-sm text-muted-foreground sm:px-6">{{ t('jobTeam.empty') }}</p>
        <ul v-else class="divide-y">
          <JobTeamRow
            v-for="member in team.members.value"
            :key="`${member.source}-${member.userId}`"
            :member="member"
            :stage-names="stageNamesOf(member.stageIds)"
            :can-manage="canManage"
            :busy="team.busy.value === member.userId"
            @role="(next) => team.put(member.userId, next)"
            @remove="() => team.remove(member.userId)"
          />
        </ul>
      </section>
      <form
        v-if="canManage"
        class="grid gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end sm:px-6"
        data-testid="team-add-member"
        @submit.prevent="add"
      >
        <label class="grid gap-1.5 text-sm font-medium">
          {{ t('jobTeam.addPerson') }}
          <NativeSelect v-model="chosen" data-testid="team-member-select">
            <option value="">{{ t('jobTeam.choosePerson') }}</option>
            <option v-for="option in team.options.value" :key="option.userId" :value="option.userId">{{ option.name }}</option>
          </NativeSelect>
        </label>
        <label class="grid gap-1.5 text-sm font-medium">
          {{ t('jobTeam.role') }}
          <NativeSelect :model-value="role" data-testid="team-role-select" @update:model-value="pickRole">
            <option v-for="value in JOB_TEAM_ROLES" :key="value" :value="value">{{ t(`jobTeam.roles.${value}`) }}</option>
          </NativeSelect>
        </label>
        <Button type="submit" :disabled="!chosen || team.busy.value !== null" data-testid="team-add-submit">{{ t('jobTeam.add') }}</Button>
      </form>
    </template>
    <div v-else class="h-32 animate-pulse rounded-xl bg-muted" aria-busy="true" />
  </div>
</template>
