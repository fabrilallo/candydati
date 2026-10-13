<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { pageCount } from '@/lib/audit-api'

const { t } = useI18n()
const { page, events, meta, errorKey, loading, refresh, goTo } = useAuditLog()
const pages = computed(() => (meta.value ? pageCount(meta.value) : 1))
</script>

<template>
  <div class="grid gap-4">
    <div v-if="errorKey" class="grid gap-3">
      <FormAlert :message-key="errorKey" />
      <div><Button variant="outline" @click="() => refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <template v-else>
      <ol v-if="loading && events.length === 0" class="divide-y rounded-xl border bg-card" aria-busy="true" :aria-label="t('common.loading')">
        <li v-for="n in 6" :key="n" class="grid grid-cols-[2rem_1fr_auto] items-center gap-x-4 px-5 py-4">
          <Skeleton class="row-span-2 size-8 rounded-full" />
          <Skeleton class="h-4 w-2/3 max-w-80" />
          <Skeleton class="row-span-2 hidden h-3 w-24 sm:block" />
          <Skeleton class="mt-2 h-3 w-1/3 max-w-40" />
        </li>
      </ol>
      <div v-else class="transition-opacity duration-200" :class="loading ? 'opacity-60' : ''" :aria-busy="loading">
        <AuditLogTable :events="events" />
      </div>
      <PaginationBar v-if="meta && meta.total > 0" :page="page" :pages="pages" :total="meta.total" :disabled="loading" @update:page="goTo" />
    </template>
  </div>
</template>
