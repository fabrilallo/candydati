<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { can } from '@/lib/permissions-ui'
import { Button } from '@/components/ui/button'
import { curlExample, feedUrl, llmsUrl, publicApiUrl, sitemapUrl } from '@/lib/distribution-view'

/** Public addresses of the organization and the channels the instance registered, each with an on/off switch. */
const { t } = useI18n()
const config = useRuntimeConfig()
const { viewer } = useViewer()
const settings = useDistributionSettings()
const editable = computed(() => can(viewer.value?.role ?? null, 'organization:update'))
const org = computed(() => viewer.value?.organization?.slug ?? '')
const site = computed(() => config.public.siteUrl)
const apiUrl = computed(() => publicApiUrl(site.value, org.value))
const curl = computed(() => curlExample(apiUrl.value))
</script>

<template>
  <div class="grid gap-10">
    <section class="grid gap-4" aria-labelledby="addresses-title" data-testid="distribution-addresses">
      <div class="grid gap-1">
        <h2 id="addresses-title" class="text-base font-semibold tracking-tight">{{ t('distribution.settings.addresses') }}</h2>
        <p class="max-w-prose text-sm text-muted-foreground">{{ t('distribution.settings.addressesBody') }}</p>
      </div>
      <div class="grid gap-5 rounded-xl panel px-5 py-5 sm:px-6">
        <UrlField :label="t('distribution.feed.label')" :url="feedUrl(site, org)" :copy-label="t('distribution.copyUrl')" :hint="t('distribution.feed.hint')" test-id="url-feed" />
        <UrlField :label="t('distribution.llms.label')" :url="llmsUrl(site, org)" :copy-label="t('distribution.copyUrl')" :hint="t('distribution.llms.hint')" test-id="url-llms" />
        <UrlField :label="t('distribution.sitemap.label')" :url="sitemapUrl(site, org)" :copy-label="t('distribution.copyUrl')" :hint="t('distribution.sitemap.hint')" test-id="url-sitemap" />
        <UrlField :label="t('distribution.api.label')" :url="apiUrl" :copy-label="t('distribution.copyUrl')" :hint="t('distribution.api.hint')" test-id="url-api" />
        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-medium">{{ t('distribution.api.example') }}</p>
            <CopyButton :text="curl" :label="t('distribution.api.copyExample')" />
          </div>
          <pre tabindex="0" class="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs leading-relaxed" data-testid="url-curl"><code>{{ curl }}</code></pre>
        </div>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="channels-title" data-testid="distribution-channels">
      <div class="grid gap-1">
        <h2 id="channels-title" class="text-base font-semibold tracking-tight">{{ t('distribution.settings.channels') }}</h2>
        <p class="max-w-prose text-sm text-muted-foreground">{{ t('distribution.settings.channelsBody') }}</p>
      </div>
      <div v-if="settings.errorKey.value" class="grid gap-3">
        <FormAlert :message-key="settings.errorKey.value" />
        <div><Button variant="outline" @click="() => settings.refresh()">{{ t('common.retry') }}</Button></div>
      </div>
      <div v-else-if="!settings.channels.value" class="grid gap-3" aria-busy="true"><Skeleton class="h-16 w-full" /></div>
      <p v-else-if="settings.channels.value.length === 0" class="rounded-xl border border-dashed border-input px-6 py-6 text-sm text-muted-foreground" data-testid="channels-empty">{{ t('distribution.settings.empty') }}</p>
      <ul v-else class="divide-y overflow-hidden rounded-xl panel">
        <li v-for="channel in settings.channels.value" :key="channel.channelId" class="flex items-center gap-4 px-5 py-4 sm:px-6" :class="settings.busy.value === channel.channelId ? 'opacity-60' : ''" data-testid="channel-item">
          <p class="min-w-0 flex-1 text-sm font-medium">{{ channel.label || channel.channelId }}</p>
          <span class="text-xs text-muted-foreground">{{ channel.enabled ? t('distribution.settings.on') : t('distribution.settings.off') }}</span>
          <button
            type="button"
            role="switch"
            :aria-checked="channel.enabled"
            :aria-label="t('distribution.settings.toggle', { channel: channel.label || channel.channelId })"
            :disabled="!editable || settings.busy.value === channel.channelId"
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ease-snap focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-hidden disabled:opacity-60"
            :class="channel.enabled ? 'bg-primary' : 'bg-input'"
            data-testid="channel-toggle"
            @click="settings.setEnabled(channel, !channel.enabled)"
          >
            <span class="size-4 rounded-full bg-card shadow-xs transition-transform duration-150 ease-snap" :class="channel.enabled ? 'translate-x-4.5' : 'translate-x-0.5'" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
