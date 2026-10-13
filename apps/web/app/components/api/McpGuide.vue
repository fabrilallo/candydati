<script setup lang="ts">
import { mcpConfigSnippet, mcpEndpoint } from '@/lib/api-keys'
import { MCP_TOOLS } from '@/lib/phase6-contract'

/** How to connect an external agent: the endpoint, a config block for MCP clients, and what each tool does. */
const { t } = useI18n()
const config = useRuntimeConfig()
const platform = usePlatform()
const endpoint = computed(() => mcpEndpoint(config.public.siteUrl))
const snippet = computed(() => mcpConfigSnippet({ serverName: platform.value.name, url: endpoint.value, token: t('mcp.tokenPlaceholder') }))
</script>

<template>
  <section class="grid gap-4" aria-labelledby="mcp-title" data-testid="mcp-guide">
    <div class="grid gap-1">
      <h2 id="mcp-title" class="text-base font-semibold tracking-tight">{{ t('mcp.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('mcp.description') }}</p>
    </div>
    <div class="grid gap-5 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6">
      <div class="grid gap-2">
        <p class="text-sm font-medium">{{ t('mcp.endpoint') }}</p>
        <div class="flex min-w-0 items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm" data-testid="mcp-endpoint">{{ endpoint }}</code>
          <CopyButton :text="endpoint" :label="t('mcp.copyEndpoint')" />
        </div>
        <p class="text-xs text-muted-foreground">{{ t('mcp.endpointHint') }}</p>
      </div>
      <div class="grid gap-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{{ t('mcp.config') }}</p>
          <CopyButton :text="snippet" :label="t('mcp.copyConfig')" />
        </div>
        <pre class="overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-xs leading-relaxed" data-testid="mcp-config"><code>{{ snippet }}</code></pre>
        <p class="text-xs text-muted-foreground">{{ t('mcp.configHint') }}</p>
      </div>
      <div class="grid gap-2">
        <p class="text-sm font-medium">{{ t('mcp.toolsTitle') }}</p>
        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[13rem_minmax(0,1fr)]" data-testid="mcp-tools">
          <template v-for="tool in MCP_TOOLS" :key="tool">
            <dt><code class="font-mono text-xs">{{ tool }}</code></dt>
            <dd class="text-muted-foreground max-sm:mb-1">{{ t(`mcp.tools.${tool}`) }}</dd>
          </template>
        </dl>
        <p class="text-xs text-muted-foreground">{{ t('mcp.toolsNote') }}</p>
      </div>
    </div>
  </section>
</template>
