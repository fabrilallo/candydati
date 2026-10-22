<script setup lang="ts">
import { ScaleIcon } from '@lucide/vue'
import type { ComplianceFix } from '@/lib/compliance-fix'
import type { ComplianceView } from '@/lib/compliance-view'

/**
 * What the law asks of the text (D.Lgs. 198/2006, L. 68/99): clear violations block publishing and say how to fix
 * them in one click where possible; doubtful wording sits in a quieter "Da rivedere" list. Hidden when all is well.
 */
defineProps<{ view: ComplianceView; language: string; disabled: boolean }>()
const emit = defineEmits<{ fix: [fix: ComplianceFix]; jump: [fieldId: string] }>()
const { t } = useI18n()
</script>

<template>
  <section v-if="view.blocking.length || view.warnings.length" :aria-label="t('job.compliance.title')" class="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5" data-testid="compliance-panel">
    <div class="flex items-start gap-2.5">
      <ScaleIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div class="grid gap-0.5">
        <h2 class="text-sm font-semibold">{{ t('job.compliance.title') }}</h2>
        <p class="text-xs text-muted-foreground">{{ view.blocking.length ? t('job.compliance.blockingIntro', { count: view.blocking.length }, view.blocking.length) : t('job.compliance.warningsIntro') }}</p>
      </div>
    </div>
    <ul v-if="view.blocking.length" class="grid divide-y rounded-lg border border-destructive/30 bg-destructive-soft/40" data-testid="compliance-blocking">
      <li v-for="item in view.blocking" :key="item.key" class="grid gap-2 px-3.5 py-3">
        <p class="text-sm font-medium text-destructive">{{ t(item.messageKey) }}</p>
        <button type="button" class="w-fit text-left text-sm underline decoration-destructive/50 underline-offset-4 hover:decoration-destructive" :lang="language" @click="emit('jump', item.fieldId)">«{{ item.match }}»</button>
        <p v-if="item.suggestion" class="text-xs leading-relaxed text-pretty text-muted-foreground" :lang="language">{{ item.suggestion }}</p>
        <div v-if="item.fixes.length && !disabled" class="flex flex-wrap gap-1.5">
          <button
            v-for="fix in item.fixes"
            :key="fix.labelKey"
            type="button"
            class="rounded-md border bg-card px-2.5 py-1 text-left text-xs font-medium shadow-xs transition-colors duration-150 ease-snap hover:bg-muted active:scale-[0.98]"
            data-testid="compliance-fix"
            @click="emit('fix', fix)"
          >
            {{ t(fix.labelKey, fix.params) }}
          </button>
        </div>
      </li>
    </ul>
    <div v-if="view.warnings.length" class="grid gap-1.5" data-testid="compliance-warnings">
      <h3 class="text-xs font-medium text-muted-foreground">{{ t('job.compliance.review') }}</h3>
      <ul class="grid divide-y rounded-lg border">
        <li v-for="item in view.warnings" :key="item.key" class="grid gap-1.5 px-3.5 py-2.5">
          <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span class="font-medium">{{ t(item.messageKey) }}</span>
            <button type="button" class="text-left text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground" :lang="language" @click="emit('jump', item.fieldId)">«{{ item.match }}»</button>
          </p>
          <p v-if="item.suggestion" class="text-xs leading-relaxed text-pretty text-muted-foreground" :lang="language">{{ item.suggestion }}</p>
          <div v-if="item.fixes.length && !disabled" class="flex flex-wrap gap-1.5">
            <button v-for="fix in item.fixes" :key="fix.labelKey" type="button" class="rounded-md px-2 py-0.5 text-left text-xs font-medium text-link hover:bg-accent" data-testid="compliance-fix" @click="emit('fix', fix)">
              {{ t(fix.labelKey, fix.params) }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
