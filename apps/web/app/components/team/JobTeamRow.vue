<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { JOB_TEAM_ROLES, type JobTeamMemberDto, type JobTeamRole } from '@/lib/job-team-api'

/** One person of a job's team: name, email, team role and where the membership comes from. */
const props = defineProps<{ member: JobTeamMemberDto; stageNames: readonly string[]; canManage: boolean; busy: boolean }>()
const emit = defineEmits<{ role: [role: JobTeamRole]; remove: [] }>()
const { t } = useI18n()
const isRole = (value: string): value is JobTeamRole => (JOB_TEAM_ROLES as readonly string[]).includes(value)
const changeRole = (value: string): void => {
  if (isRole(value) && value !== props.member.role) emit('role', value)
}
</script>

<template>
  <li class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 sm:px-6" data-testid="team-member-row">
    <div class="grid min-w-0 gap-0.5">
      <span class="truncate text-sm font-medium">{{ member.name }}</span>
      <span class="truncate text-sm text-muted-foreground">{{ member.email }}</span>
      <span v-if="stageNames.length" class="text-xs text-muted-foreground" data-testid="team-member-stages">
        {{ t('jobTeam.interviewsAt', { stages: stageNames.join(', ') }) }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <NativeSelect
        v-if="canManage && member.removable"
        class="w-44"
        :model-value="member.role"
        :disabled="busy"
        :aria-label="t('jobTeam.roleOf', { name: member.name })"
        data-testid="team-member-role"
        @update:model-value="changeRole"
      >
        <option v-for="role in JOB_TEAM_ROLES" :key="role" :value="role">{{ t(`jobTeam.roles.${role}`) }}</option>
      </NativeSelect>
      <span v-else class="text-sm text-muted-foreground">{{ t(`jobTeam.roles.${member.role}`) }}</span>
      <span v-if="member.source === 'stage_interviewer'" class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{{ t('jobTeam.fromStage') }}</span>
      <Button
        v-if="canManage && member.removable"
        variant="ghost"
        size="icon"
        :disabled="busy"
        :aria-label="t('jobTeam.remove', { name: member.name })"
        data-testid="team-remove"
        @click="emit('remove')"
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </div>
  </li>
</template>
