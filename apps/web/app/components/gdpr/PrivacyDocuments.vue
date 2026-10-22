<script setup lang="ts">
import { FileTextIcon } from '@lucide/vue'
import { LEGAL_DOCUMENTS, legalDocLink } from '@/lib/legal-docs'
import { safeExternalUrl } from '@/lib/safe-url'

/**
 * "Documenti" of the privacy settings: the registro filled in, and the legal templates of the repository. They are
 * linked only when the instance says where its source can be browsed; otherwise their paths are shown as text.
 */
const { t } = useI18n()
const sourceUrl = computed(() => String(useRuntimeConfig().public.sourceUrl ?? ''))
const documents = computed(() => LEGAL_DOCUMENTS.map((doc) => ({ ...doc, href: legalDocLink(doc.path, sourceUrl.value) })))
const linked = computed(() => documents.value.some((doc) => doc.href !== null))
</script>

<template>
  <section class="grid gap-5" aria-labelledby="documents-title" data-testid="privacy-documents">
    <div class="grid gap-1.5">
      <h2 id="documents-title" class="text-lg font-semibold tracking-tight">{{ t('privacyDocs.title') }}</h2>
      <p class="max-w-3xl text-sm text-muted-foreground">{{ t('privacyDocs.intro') }}</p>
    </div>
    <ProcessingRecord />
    <div class="grid gap-3">
      <div class="grid gap-1">
        <h3 class="text-base font-semibold tracking-tight">{{ t('privacyDocs.templatesTitle') }}</h3>
        <p class="text-sm text-muted-foreground">{{ t('privacyDocs.templatesNote') }}<template v-if="!linked"> {{ t('privacyDocs.noSource') }}</template></p>
      </div>
      <ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" data-testid="legal-templates">
        <li v-for="doc in documents" :key="doc.path" class="flex items-start gap-3 px-5 py-3.5" data-testid="legal-template">
          <FileTextIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="grid min-w-0 gap-0.5">
            <span class="text-sm font-medium">{{ t(`privacyDocs.docs.${doc.key}`) }}</span>
            <a v-if="doc.href" :href="safeExternalUrl(doc.href) ?? undefined" target="_blank" rel="noopener noreferrer" class="truncate font-mono text-xs text-link underline-offset-4 hover:underline">{{ doc.path }}</a>
            <code v-else class="truncate font-mono text-xs text-muted-foreground">{{ doc.path }}</code>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
