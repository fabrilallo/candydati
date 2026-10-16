<script setup lang="ts">
import type { CandidateApplicationDto } from '@candydati/domain'
import { DownloadIcon, FileTextIcon, ImageIcon } from '@lucide/vue'
import { attachmentUrl } from '@/lib/candidate-api'
import { formatBytes } from '@/lib/cv-file'
import { Button } from '@/components/ui/button'

/**
 * What a migration brought besides the CV: the attachments (each download is audited by the api, like the CV) and the
 * answers given on the previous ATS's form. Nothing is previewed: a file opens only when a person asks for it.
 */
const props = defineProps<{ application: CandidateApplicationDto }>()
const { t, locale } = useI18n()
const attachments = computed(() => props.application.attachments ?? [])
const answers = computed(() => props.application.answers ?? [])
const attachmentsHeading = useId()
const answersHeading = useId()
const isImage = (mediaType: string): boolean => mediaType.startsWith('image/')
</script>

<template>
  <div v-if="attachments.length > 0 || answers.length > 0" class="grid gap-8" data-testid="application-documents">
    <section v-if="attachments.length > 0" :aria-labelledby="attachmentsHeading" class="grid gap-3" data-testid="attachments">
      <h3 :id="attachmentsHeading" class="text-sm font-semibold">{{ t('candidate.attachments.title') }}</h3>
      <ul class="grid gap-2">
        <li v-for="file in attachments" :key="file.id" class="flex items-center gap-3 rounded-lg border bg-card p-3" data-testid="attachment">
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
            <ImageIcon v-if="isImage(file.mediaType)" class="size-4" />
            <FileTextIcon v-else class="size-4" />
          </span>
          <div class="grid min-w-0 flex-1 gap-0.5">
            <p class="truncate text-sm font-medium" data-testid="attachment-name">{{ file.fileName }}</p>
            <p class="figure text-xs text-muted-foreground">{{ t(`candidate.attachments.kind.${file.kind}`) }} · {{ formatBytes(file.sizeBytes, locale) }}</p>
          </div>
          <Button as-child variant="outline" size="sm">
            <a :href="attachmentUrl(application.id, file.id)" download :aria-label="t('candidate.attachments.downloadNamed', { name: file.fileName })" data-testid="attachment-download">
              <DownloadIcon aria-hidden="true" />{{ t('candidate.cv.download') }}
            </a>
          </Button>
        </li>
      </ul>
    </section>
    <section v-if="answers.length > 0" :aria-labelledby="answersHeading" class="grid gap-3" data-testid="form-answers">
      <div class="grid gap-1">
        <h3 :id="answersHeading" class="text-sm font-semibold">{{ t('candidate.answers.title') }}</h3>
        <p class="text-xs text-muted-foreground">{{ t('candidate.answers.source') }}</p>
      </div>
      <dl class="divide-y rounded-lg border bg-card">
        <div v-for="(item, index) in answers" :key="index" class="grid gap-1 px-4 py-3">
          <dt class="text-sm text-muted-foreground">{{ item.question }}</dt>
          <dd class="text-sm break-words whitespace-pre-line">{{ item.answer }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
