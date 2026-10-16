<script setup lang="ts">
import { BellIcon, CheckCheckIcon } from '@lucide/vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { errorKeyOf } from '@/lib/auth-errors'
import { listNotifications, markRead } from '@/lib/inbox-api'
import { notificationContext, notificationLink, notificationText, unreadLabel } from '@/lib/inbox-view'
import { relativeTime } from '@/lib/job-list-view'
import type { NotificationDto } from '@candydati/domain'
import { Button } from '@/components/ui/button'
import { NuxtLink } from '#components'

/**
 * The bell in the top bar: unread count (polled every minute while the tab is visible), and on open the latest
 * notifications with their wording, time and link. Opening one marks it read; "Segna tutte come lette" clears all.
 */
const { t, locale } = useI18n()
const request = useJobsApi()
const unread = useUnreadCount()
const open = ref(false)
const items = ref<readonly NotificationDto[] | null>(null)
const errorKey = ref<string | null>(null)
const marking = ref(false)
const badge = computed(() => unreadLabel(unread.count.value ?? 0))
const now = ref(new Date())

const load = async (): Promise<void> => {
  errorKey.value = null
  now.value = new Date()
  try {
    items.value = (await listNotifications(request)).items
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  }
}
watch(open, (isOpen) => {
  if (isOpen) void load()
})

const readAt = (list: readonly NotificationDto[], ids: ReadonlySet<string> | 'all'): readonly NotificationDto[] =>
  list.map((item) => (item.readAt === null && (ids === 'all' || ids.has(item.id)) ? { ...item, readAt: new Date().toISOString() } : item))

const markAll = async (): Promise<void> => {
  marking.value = true
  try {
    await markRead(request, { all: true })
    items.value = items.value ? readAt(items.value, 'all') : null
    unread.set(0)
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    marking.value = false
  }
}
const follow = (item: NotificationDto): void => {
  open.value = false
  if (item.readAt !== null) return
  items.value = items.value ? readAt(items.value, new Set([item.id])) : null
  unread.set(Math.max(0, (unread.count.value ?? 1) - 1))
  markRead(request, { ids: [item.id] }).catch((error: unknown) => console.error('[notifications] mark read failed', error instanceof Error ? error.message : error))
}
const wording = (item: NotificationDto): string => {
  const text = notificationText(item, now.value)
  return t(text.key, text.params, text.count)
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="relative"
        :aria-label="unread.count.value ? t('notifications.bellUnread', { count: unread.count.value }, unread.count.value) : t('notifications.bell')"
        data-testid="notification-bell"
      >
        <BellIcon aria-hidden="true" />
        <span
          v-if="badge"
          class="figure absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground ring-2 ring-background"
          aria-hidden="true"
          data-testid="notification-badge"
        >{{ badge }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        class="z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg duration-150 ease-snap data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        data-testid="notification-panel"
      >
        <div class="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1">
          <h2 class="text-sm font-semibold">{{ t('notifications.title') }}</h2>
          <Button v-if="items && items.some((item) => item.readAt === null)" variant="ghost" size="sm" :disabled="marking" data-testid="notifications-mark-all" @click="markAll">
            <CheckCheckIcon aria-hidden="true" />{{ t('notifications.markAll') }}
          </Button>
        </div>
        <FormAlert v-if="errorKey" :message-key="errorKey" class="mx-1" />
        <div v-else-if="items === null" class="grid gap-2 p-2" aria-busy="true">
          <div v-for="index in 3" :key="index" class="h-10 animate-shimmer rounded-md bg-muted motion-reduce:animate-none" />
        </div>
        <p v-else-if="items.length === 0" class="px-2.5 py-3 text-sm text-muted-foreground" data-testid="notifications-empty">{{ t('notifications.empty') }}</p>
        <ul v-else class="grid max-h-[min(28rem,70dvh)] gap-0.5 overflow-y-auto" data-testid="notification-list">
          <li v-for="item in items" :key="item.id">
            <component
              :is="notificationLink(item) ? NuxtLink : 'div'"
              :to="notificationLink(item) ?? undefined"
              class="flex items-start gap-3 rounded-md px-2.5 py-2 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"
              :data-unread="item.readAt === null || undefined"
              data-testid="notification-item"
              @click="follow(item)"
            >
              <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="item.readAt === null ? 'bg-primary' : 'bg-transparent'" aria-hidden="true" />
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="font-medium">
                  <span v-if="item.readAt === null" class="sr-only">{{ t('notifications.unread') }}:</span>
                  {{ wording(item) }}
                </span>
                <span v-if="notificationContext(item)" class="truncate text-muted-foreground">{{ notificationContext(item) }}</span>
                <time class="text-xs text-muted-foreground" :datetime="item.createdAt">{{ relativeTime(item.createdAt, now, locale) }}</time>
              </span>
            </component>
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
