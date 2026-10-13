<script setup lang="ts">
import { CircleCheckIcon } from '@lucide/vue'
import type { PublicPrivacyNoticeDto } from '@/lib/candidate-schemas'
import { Button } from '@/components/ui/button'

/**
 * Where a candidate applies, at the end of the ad. The form opens on request (here or from the action near the top)
 * and, once sent, gives way to a confirmation that restates the response commitment of the ad.
 */
const props = defineProps<{ org: string; job: string; title: string; organization: string; language: string; responseDays: number; notice: PublicPrivacyNoticeDto }>()
const x = useAdText(() => props.language)
const open = ref(false)
const sent = ref<{ readonly firstName: string; readonly email: string } | null>(null)
const section = ref<HTMLElement | null>(null)

const focusFirst = async (id: string): Promise<void> => {
  await nextTick()
  section.value?.scrollIntoView({ block: 'start' })
  document.getElementById(id)?.focus({ preventScroll: true })
}
/** Opens the form and puts the candidate on its first field. */
const reveal = async (): Promise<void> => {
  open.value = true
  await focusFirst(sent.value ? 'apply-success-title' : 'apply-first-name')
}
const done = async (firstName: string, email: string): Promise<void> => {
  sent.value = { firstName, email }
  await focusFirst('apply-success-title')
}
defineExpose({ reveal })
</script>

<template>
  <section id="apply" ref="section" class="grid scroll-mt-6 gap-6 border-t pt-10" aria-labelledby="apply-title" :lang="language" data-testid="apply-section">
    <div class="grid gap-1.5">
      <h2 id="apply-title" class="text-xl font-semibold tracking-tight">{{ x('apply.title') }}</h2>
      <p class="max-w-xl text-[0.9375rem] text-muted-foreground">{{ x('apply.intro', { organization }) }}</p>
    </div>
    <div v-if="sent" class="grid gap-3 rounded-xl border bg-card px-5 py-6 sm:px-6" role="status" data-testid="apply-success">
      <CircleCheckIcon class="size-6 text-success" aria-hidden="true" />
      <h3 id="apply-success-title" tabindex="-1" class="text-lg font-semibold tracking-tight outline-none">{{ x('apply.success.title', { name: sent.firstName }) }}</h3>
      <p class="text-[0.9375rem]">{{ x('apply.success.received', { title, organization }) }}</p>
      <p class="text-[0.9375rem] font-medium" data-testid="apply-commitment">{{ x('apply.success.commitment', { count: responseDays }) }}</p>
      <p class="text-sm text-muted-foreground">{{ x('apply.success.email', { email: sent.email }) }}</p>
    </div>
    <ApplicationForm v-else-if="open" :org="org" :job="job" :organization="organization" :language="language" :notice="notice" @done="done" />
    <div v-else>
      <Button size="lg" data-testid="apply-open" @click="reveal">{{ x('apply.open') }}</Button>
    </div>
  </section>
</template>
