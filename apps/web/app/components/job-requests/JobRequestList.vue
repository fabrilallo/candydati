<script setup lang="ts">
import { ClipboardListIcon, PlusIcon } from '@lucide/vue'
import { formatDate } from '@/lib/format'
import { requestBudget, requestsEmptyKey } from '@/lib/job-request-view'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/** Requests, newest first: title, status, who asked and when, headcount and budget. The empty state says what to do. */
const { t, locale } = useI18n()
const { viewer } = useViewer()
const role = computed(() => viewer.value?.role ?? null)
const requests = useJobRequests()
const team = useMembers()
const emptyKey = computed(() => requestsEmptyKey(role.value))
</script>

<template>
  <section class="grid gap-3" aria-labelledby="requests-list">
    <h2 id="requests-list" class="sr-only">{{ t('jobRequests.list.label') }}</h2>
    <div v-if="requests.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="requests.errorKey.value" />
      <div><Button variant="outline" @click="() => requests.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <div v-else-if="!requests.items.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-18 w-full" /><Skeleton class="h-18 w-full" /></div>
    <div v-else-if="requests.items.value.length === 0" class="grid justify-items-start gap-3 rounded-xl border border-dashed border-input px-6 py-8" data-testid="requests-empty">
      <div class="grid gap-1">
        <p class="text-[0.9375rem] font-medium">{{ t(emptyKey) }}</p>
        <p class="max-w-xl text-sm text-pretty text-muted-foreground">{{ t(`${emptyKey}Body`) }}</p>
      </div>
      <Button v-if="can(role, 'job:create')" as-child size="sm"><NuxtLink to="/app/job-requests/new"><PlusIcon aria-hidden="true" />{{ t('jobRequests.new') }}</NuxtLink></Button>
    </div>
    <ul v-else class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="request-list">
      <li v-for="item in requests.items.value" :key="item.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 sm:px-6" data-testid="request-item" :data-status="item.status">
        <ClipboardListIcon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div class="grid min-w-0 flex-1 gap-1">
          <p class="flex flex-wrap items-center gap-2">
            <NuxtLink :to="`/app/job-requests/${item.id}`" class="text-[0.9375rem] font-medium underline-offset-4 hover:underline">{{ item.title }}</NuxtLink>
            <JobRequestStatusPill :status="item.status" />
          </p>
          <p class="flex flex-wrap gap-x-2.5 gap-y-1 text-sm text-muted-foreground [&>*+*]:before:mr-2.5 [&>*+*]:before:text-input [&>*+*]:before:content-['|']">
            <span v-if="team.nameOf(item.requestedBy)">{{ t('jobRequests.list.by', { name: team.nameOf(item.requestedBy) }) }}</span>
            <span class="figure">{{ formatDate(item.createdAt, locale) }}</span>
            <span class="figure">{{ t('jobRequests.list.headcount', { count: item.headcount }, item.headcount) }}</span>
            <span v-if="requestBudget(item, locale)" class="figure">{{ requestBudget(item, locale) }}</span>
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
