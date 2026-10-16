<script setup lang="ts">
import type { PublicConsentDto } from '@candydati/domain'
import { CircleCheckIcon, LoaderCircleIcon, Trash2Icon } from '@lucide/vue'
import type { Translate } from '@/lib/ad-text'
import { answerConsent, consentAnswer, consentFailure, type ConsentFailure } from '@/lib/import-api'
import { Button } from '@/components/ui/button'

/**
 * The reconfirmation of an imported candidate: who imported the CV and why they are asked, the notice, the same two
 * consents as the application form, then "Confermo" or the plain refusal that erases everything at once. One call
 * per answer, nothing polled.
 */
const props = defineProps<{ token: string; consent: PublicConsentDto; x: Translate }>()
const emit = defineEmits<{ failed: [failure: ConsentFailure] }>()
const request = useJobsApi()
const selection = ref(false)
const talentPool = ref(false)
const selectionError = ref<string | undefined>(undefined)
const declining = ref(false)
const pending = ref<'confirm' | 'decline' | null>(null)
const outcome = ref<'given' | 'erased' | null>(null)
const errorKey = ref<string | null>(null)
const organization = computed(() => props.consent.organization.name)

const focus = async (id: string): Promise<void> => {
  await nextTick()
  document.getElementById(id)?.focus()
}

const send = async (choice: 'confirm' | 'decline'): Promise<void> => {
  errorKey.value = null
  if (choice === 'confirm' && !selection.value) {
    selectionError.value = props.x('apply.validation.selection')
    await focus('consent-selection')
    return
  }
  pending.value = choice
  try {
    await answerConsent(request, props.token, consentAnswer(choice, talentPool.value))
    outcome.value = choice === 'confirm' ? 'given' : 'erased'
    await focus('reconfirm-outcome')
  } catch (error) {
    const failure = consentFailure(error)
    if (failure === 'expired' || failure === 'used' || failure === 'invalid') emit('failed', failure)
    else errorKey.value = `reconfirm.${failure}.body`
  } finally {
    pending.value = null
  }
}
watch(selection, (value) => {
  if (value) selectionError.value = undefined
})
</script>

<template>
  <div v-if="outcome" class="grid gap-3 rounded-xl border bg-card px-5 py-6 sm:px-6" role="status" data-testid="reconfirm-outcome" :data-outcome="outcome">
    <h2 id="reconfirm-outcome" tabindex="-1" class="flex items-center gap-2 text-lg font-semibold tracking-tight outline-none">
      <CircleCheckIcon v-if="outcome === 'given'" class="size-5 text-success" aria-hidden="true" />
      <Trash2Icon v-else class="size-5 text-muted-foreground" aria-hidden="true" />
      {{ x(`reconfirm.${outcome === 'given' ? 'done' : 'erased'}.title`) }}
    </h2>
    <p class="text-[0.9375rem] text-pretty text-muted-foreground">{{ x(`reconfirm.${outcome === 'given' ? 'done' : 'erased'}.body`, { organization, email: consent.privacyNotice.contactEmail }) }}</p>
  </div>

  <form v-else class="grid gap-6" novalidate :aria-busy="pending !== null" data-testid="reconfirm-form" @submit.prevent="send('confirm')">
    <ConsentBlock
      :notice="consent.privacyNotice"
      :organization="organization"
      :selection="selection"
      :talent-pool="talentPool"
      :error="selectionError"
      :x="x"
      @update:selection="selection = $event"
      @update:talent-pool="talentPool = $event"
    />

    <p v-if="errorKey" class="text-sm font-medium text-destructive" role="alert" data-testid="reconfirm-error">{{ x(errorKey) }}</p>

    <div class="grid gap-3">
      <Button type="submit" size="lg" class="w-full sm:w-auto sm:justify-self-start" :disabled="pending !== null" data-testid="reconfirm-confirm">
        <LoaderCircleIcon v-if="pending === 'confirm'" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ pending === 'confirm' ? x('reconfirm.sending') : x('reconfirm.confirm') }}
      </Button>
    </div>

    <section class="grid gap-3 border-t pt-6" aria-labelledby="reconfirm-decline-title" data-testid="reconfirm-decline">
      <h2 id="reconfirm-decline-title" class="sr-only">{{ x('reconfirm.decline') }}</h2>
      <p class="text-sm text-pretty text-muted-foreground" data-testid="reconfirm-decline-hint">{{ x('reconfirm.declineHint') }}</p>
      <div v-if="!declining">
        <Button type="button" variant="outline" class="w-full whitespace-normal sm:w-auto" :disabled="pending !== null" data-testid="reconfirm-decline-start" @click="declining = true; focus('reconfirm-decline-yes')">
          {{ x('reconfirm.decline') }}
        </Button>
      </div>
      <div v-else class="grid gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-4" role="group" aria-labelledby="reconfirm-decline-sure">
        <p id="reconfirm-decline-sure" class="text-sm font-medium text-destructive">{{ x('reconfirm.declineSure') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button id="reconfirm-decline-yes" type="button" variant="destructive" :disabled="pending !== null" data-testid="reconfirm-decline-yes" @click="send('decline')">
            <LoaderCircleIcon v-if="pending === 'decline'" class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {{ pending === 'decline' ? x('reconfirm.sending') : x('reconfirm.declineYes') }}
          </Button>
          <Button type="button" variant="outline" :disabled="pending !== null" @click="declining = false">{{ x('reconfirm.declineNo') }}</Button>
        </div>
      </div>
    </section>
  </form>
</template>
