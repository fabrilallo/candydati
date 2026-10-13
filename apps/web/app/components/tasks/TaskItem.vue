<script setup lang="ts">
import { CircleCheckBigIcon, CircleIcon, CalendarClockIcon, UserRoundIcon } from '@lucide/vue'
import { fullName } from '@/lib/candidate-view'
import { formatDate } from '@/lib/format'
import { taskGroup } from '@/lib/inbox-view'
import type { TaskDto } from '@tt/domain'

/** One task: a round toggle (done or open), the title, due date, assignee and, in "Le mie attività", whose task it is. */
const props = defineProps<{ task: TaskDto; now: Date; assigneeName: string | null; canToggle: boolean; busy?: boolean; showContext?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const { t, locale } = useI18n()
const done = computed(() => props.task.completedAt !== null)
const late = computed(() => !done.value && taskGroup(props.task, props.now) === 'overdue')
const jobTitle = computed(() => props.task.jobTitle)
const contextLink = computed(() => (props.task.candidate ? `/app/candidates/${encodeURIComponent(props.task.candidate.id)}${props.task.applicationId ? `?application=${encodeURIComponent(props.task.applicationId)}` : ''}` : null))
</script>

<template>
  <li class="flex items-start gap-3 px-5 py-3.5 sm:px-6" :class="busy ? 'opacity-60' : ''" data-testid="task-item" :data-task-id="task.id" :data-done="done || undefined">
    <button
      type="button"
      class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
      :class="done ? 'text-success hover:text-success' : ''"
      :disabled="!canToggle || busy"
      :aria-pressed="done"
      :aria-label="done ? t('tasks.reopen', { title: task.title }) : t('tasks.complete', { title: task.title })"
      data-testid="task-toggle"
      @click="emit('toggle')"
    >
      <CircleCheckBigIcon v-if="done" class="size-5" aria-hidden="true" />
      <CircleIcon v-else class="size-5" aria-hidden="true" />
    </button>
    <div class="grid min-w-0 flex-1 gap-1">
      <p class="text-sm font-medium text-pretty" :class="done ? 'text-muted-foreground line-through' : ''">{{ task.title }}</p>
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span v-if="task.dueAt" class="figure inline-flex items-center gap-1" :class="late ? 'font-medium text-destructive' : ''" data-testid="task-due">
          <CalendarClockIcon class="size-3.5" aria-hidden="true" />{{ t('tasks.dueOn', { date: formatDate(task.dueAt, locale) }) }}
        </span>
        <span v-if="assigneeName" class="inline-flex items-center gap-1"><UserRoundIcon class="size-3.5" aria-hidden="true" />{{ t('tasks.assignedTo', { name: assigneeName }) }}</span>
        <span v-if="done" class="font-medium text-success">{{ t('tasks.done') }}</span>
      </p>
      <p v-if="showContext && (task.candidate || jobTitle)" class="truncate text-xs text-muted-foreground">
        <NuxtLink v-if="task.candidate && contextLink" :to="contextLink" class="font-medium text-primary underline-offset-4 hover:underline">{{ fullName(task.candidate) }}</NuxtLink>
        <template v-if="task.candidate && jobTitle">, </template>{{ jobTitle }}
      </p>
    </div>
  </li>
</template>
