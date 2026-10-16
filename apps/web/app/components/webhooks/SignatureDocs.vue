<script setup lang="ts">
import { WEBHOOK_HEADERS } from '@candydati/domain'

/** Short developer note: the headers of every delivery and how to check the signature. */
const { t } = useI18n()
const rows = computed(() => [
  { name: WEBHOOK_HEADERS.event, text: t('webhooks.docs.event') },
  { name: WEBHOOK_HEADERS.delivery, text: t('webhooks.docs.delivery') },
  { name: WEBHOOK_HEADERS.signature, text: t('webhooks.docs.signature') },
  { name: WEBHOOK_HEADERS.timestamp, text: t('webhooks.docs.timestamp') },
])
const example = `expected = hex(hmac_sha256(secret, timestamp + "." + raw_body))
valid = constant_time_equal("sha256=" + expected, header["${WEBHOOK_HEADERS.signature}"])`
</script>

<template>
  <section class="grid gap-3" aria-labelledby="webhook-docs" data-testid="webhook-docs">
    <h2 id="webhook-docs" class="text-base font-semibold tracking-tight">{{ t('webhooks.docs.title') }}</h2>
    <p class="max-w-prose text-sm text-muted-foreground">{{ t('webhooks.docs.body') }}</p>
    <dl class="grid gap-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <template v-for="row in rows" :key="row.name">
        <dt><code class="font-mono text-xs">{{ row.name }}</code></dt>
        <dd class="text-muted-foreground">{{ row.text }}</dd>
      </template>
    </dl>
    <pre tabindex="0" class="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs leading-relaxed"><code>{{ example }}</code></pre>
    <p class="max-w-prose text-sm text-muted-foreground">{{ t('webhooks.docs.retries') }}</p>
  </section>
</template>
