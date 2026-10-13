<script setup lang="ts">
import { groupTasks } from '@/lib/inbox-view'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** "Le mie attività": the open tasks of the signed-in person, grouped by due date (scadute, oggi, prossime, senza scadenza). */
const { t } = useI18n()
const { viewer } = useViewer()
const canManage = computed(() => can(viewer.value?.role ?? null, 'task:manage'))
const tasks = useTasks(null)
const nowMs = useState('tasks-now', () => Date.now())
const now = computed(() => new Date(nowMs.value))
const groups = computed(() => groupTasks(tasks.tasks.value ?? [], now.value))
</script>

<template>
  <div class="grid gap-8">
    <div v-if="tasks.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="tasks.errorKey.value" />
      <div><Button variant="outline" @click="() => tasks.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!tasks.tasks.value" class="grid gap-3" aria-busy="true" data-testid="my-tasks-loading">
      <Skeleton class="h-5 w-24" /><Skeleton class="h-14 w-full" /><Skeleton class="h-14 w-full" />
    </div>
    <p v-else-if="groups.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="my-tasks-empty">{{ t('tasks.empty') }}</p>
    <template v-else>
    <section v-for="entry in groups" :key="entry.group" class="grid gap-3" :aria-labelledby="`tasks-${entry.group}`" :data-group="entry.group">
      <h2 :id="`tasks-${entry.group}`" class="flex items-center gap-2 text-base font-semibold tracking-tight" :class="entry.group === 'overdue' ? 'text-destructive' : ''">
        {{ t(`tasks.groups.${entry.group}`) }}
        <span class="figure rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{{ entry.tasks.length }}</span>
      </h2>
      <ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
        <TaskItem
          v-for="task in entry.tasks"
          :key="task.id"
          :task="task"
          :now="now"
          :assignee-name="null"
          :can-toggle="canManage || task.assigneeId === viewer?.user.id"
          :busy="tasks.busy.value === task.id"
          show-context
          @toggle="tasks.toggle(task)"
        />
      </ul>
    </section>
    </template>
  </div>
</template>
