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
      <div v-if="loading && events.length === 0" class="grid gap-2" aria-busy="true">
        <Skeleton v-for="n in 5" :key="n" class="h-12 w-full" />
      </div>
      <div v-else :class="loading ? 'opacity-60 transition-opacity' : ''" :aria-busy="loading">
        <AuditLogTable :events="events" />
      </div>
      <PaginationBar v-if="meta && meta.total > 0" :page="page" :pages="pages" :total="meta.total" :disabled="loading" @update:page="goTo" />
    </template>
  </div>
</template>
