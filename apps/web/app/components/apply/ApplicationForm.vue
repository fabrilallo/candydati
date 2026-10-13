<script setup lang="ts">
import { CircleAlertIcon, InfoIcon } from '@lucide/vue'
import { MESSAGE_MAX, NAME_MAX, type PublicPrivacyNoticeDto } from '@tt/domain'
import type { ApplyField as Field } from '@/lib/application-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/**
 * The application form of the public page: no account, only what selection needs (PRODUCT.md §6 minimisation), the CV,
 * and the consents. Sent as multipart; on success the parent shows the confirmation.
 */
const props = defineProps<{ org: string; job: string; organization: string; language: string; notice: PublicPrivacyNoticeDto }>()
const emit = defineEmits<{ done: [firstName: string, email: string] }>()
const x = useAdText(() => props.language)
const notice = ref<PublicPrivacyNoticeDto>(props.notice)
const form = useApplyForm({ org: props.org, job: props.job }, notice)
const values = form.values
const err = (field: Field): string | undefined => {
  const key = form.errors.value[field]
  return key ? x.value(key, field === 'firstName' || field === 'lastName' ? { max: NAME_MAX } : { max: MESSAGE_MAX }) : undefined
}
const optional = computed(() => ` ${x.value('apply.fields.optional')}`)
const FOCUS_ORDER: readonly Field[] = ['firstName', 'lastName', 'email', 'phone', 'linkedinUrl', 'cv', 'message', 'selection']
const FOCUS_IDS: Readonly<Record<Field, string>> = {
  firstName: 'apply-first-name',
  lastName: 'apply-last-name',
  email: 'apply-email',
  phone: 'apply-phone',
  linkedinUrl: 'apply-linkedin',
  cv: 'apply-cv-button',
  message: 'apply-message',
  selection: 'consent-selection',
}

const send = async (): Promise<void> => {
  const invalid = await form.submit()
  if (form.done.value) {
    emit('done', values.value.firstName.trim(), values.value.email.trim())
    return
  }
  const first = invalid ? FOCUS_ORDER.find((field) => form.errors.value[field]) : undefined
  if (first) document.getElementById(FOCUS_IDS[first])?.focus()
}
</script>

<template>
  <form class="grid gap-6" novalidate :aria-busy="form.pending.value" data-testid="application-form" @submit.prevent="send">
    <div class="grid gap-5 sm:grid-cols-2">
      <ApplyField id="apply-first-name" v-slot="{ invalid, describedBy }" :label="x('apply.fields.firstName')" :error="err('firstName')">
        <Input id="apply-first-name" autocomplete="given-name" :maxlength="NAME_MAX" :model-value="values.firstName" :aria-invalid="invalid" :aria-describedby="describedBy" required @update:model-value="form.setField('firstName', String($event))" />
      </ApplyField>
      <ApplyField id="apply-last-name" v-slot="{ invalid, describedBy }" :label="x('apply.fields.lastName')" :error="err('lastName')">
        <Input id="apply-last-name" autocomplete="family-name" :maxlength="NAME_MAX" :model-value="values.lastName" :aria-invalid="invalid" :aria-describedby="describedBy" required @update:model-value="form.setField('lastName', String($event))" />
      </ApplyField>
      <ApplyField id="apply-email" v-slot="{ invalid, describedBy }" class="sm:col-span-2" :label="x('apply.fields.email')" :hint="x('apply.fields.emailHint')" :error="err('email')">
        <Input id="apply-email" type="email" autocomplete="email" inputmode="email" :model-value="values.email" :aria-invalid="invalid" :aria-describedby="describedBy" required @update:model-value="form.setField('email', String($event))" />
      </ApplyField>
      <ApplyField id="apply-phone" v-slot="{ invalid, describedBy }" :label="x('apply.fields.phone')" :optional="optional" :error="err('phone')">
        <Input id="apply-phone" type="tel" autocomplete="tel" inputmode="tel" :model-value="values.phone" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form.setField('phone', String($event))" />
      </ApplyField>
      <ApplyField id="apply-linkedin" v-slot="{ invalid, describedBy }" :label="x('apply.fields.linkedin')" :optional="optional" :error="err('linkedinUrl')">
        <Input id="apply-linkedin" type="url" autocomplete="url" inputmode="url" placeholder="linkedin.com/in/…" :model-value="values.linkedinUrl" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form.setField('linkedinUrl', String($event))" />
      </ApplyField>
    </div>

    <CvDropzone :file="form.file.value" :error="err('cv')" :x="x" :language="language" :disabled="form.pending.value" @change="form.setFile" />

    <ApplyField id="apply-message" v-slot="{ invalid, describedBy }" :label="x('apply.fields.message')" :optional="optional" :hint="x('apply.fields.messageHint')" :error="err('message')">
      <Textarea id="apply-message" rows="4" :maxlength="MESSAGE_MAX" :model-value="values.message" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="form.setField('message', String($event))" />
    </ApplyField>

    <div aria-hidden="true" class="absolute -left-[9999px] h-px w-px overflow-hidden" data-testid="honeypot">
      <label for="apply-website">Website</label>
      <input id="apply-website" name="website" type="text" tabindex="-1" autocomplete="off" :value="values.website" @input="form.setField('website', ($event.target as HTMLInputElement).value)" />
    </div>

    <p v-if="form.noticeChanged.value" class="flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-sm" role="status" data-testid="notice-changed">
      <InfoIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{{ x('apply.consent.changed', { version: notice.version }) }}
    </p>
    <ConsentBlock
      :notice="notice"
      :organization="organization"
      :selection="values.selection"
      :talent-pool="values.talentPool"
      :error="err('selection')"
      :x="x"
      @update:selection="form.setField('selection', $event)"
      @update:talent-pool="form.setField('talentPool', $event)"
    />

    <div v-if="form.errorKey.value" role="alert" class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="apply-error">
      <CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ x(form.errorKey.value) }}</span>
    </div>
    <div class="grid gap-2 sm:flex sm:items-center sm:gap-4">
      <Button type="submit" size="lg" class="w-full sm:w-auto" :disabled="form.pending.value" data-testid="apply-submit">{{ form.pending.value ? x('apply.submitting') : x('apply.submit') }}</Button>
      <p class="text-xs text-muted-foreground">{{ x('apply.noAccount') }}</p>
    </div>
  </form>
</template>
