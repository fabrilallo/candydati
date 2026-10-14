<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TwoFactorEnrolment } from '@/lib/auth-api'
import { errorKeyOf } from '@/lib/auth-errors'
import { totpSecretOf } from '@/lib/security-api'
import { totpQrDataUrl } from '@/lib/totp-qr'

/**
 * The person's own second factor. Turning it on: password -> key and setup link for the authenticator app -> a code to
 * confirm -> the backup codes, shown once. Turning it off asks for the password again.
 */
const props = defineProps<{ required: boolean }>()
const { t } = useI18n()
const api = useAuthApi()
const { viewer, refresh } = useViewer()
const gate = useState<boolean | null>('two-factor-gate', () => null)

const enabled = computed(() => viewer.value?.user.twoFactorEnabled === true)
const password = ref('')
const code = ref('')
const enrolment = ref<TwoFactorEnrolment | null>(null)
const backupCodes = ref<readonly string[] | null>(null)
const busy = ref(false)
const errorKey = ref<string | null>(null)
const copied = ref(false)
const qrCode = ref<string | null>(null)
const secret = computed(() => (enrolment.value ? totpSecretOf(enrolment.value.totpUri) : null))

/** Drawn in the browser only (the setup link holds the key, so it is never rendered on the server). */
watch(
  () => enrolment.value?.totpUri ?? null,
  async (uri) => {
    qrCode.value = null
    if (!uri) return
    try {
      qrCode.value = await totpQrDataUrl(uri)
    } catch (error) {
      console.error('[security] QR code not drawn', error instanceof Error ? error.message : error)
    }
  },
)

const run = async (work: () => Promise<void>): Promise<void> => {
  busy.value = true
  errorKey.value = null
  try {
    await work()
  } catch (error) {
    errorKey.value = errorKeyOf(error)
  } finally {
    busy.value = false
  }
}

const start = () =>
  run(async () => {
    enrolment.value = await api.enableTwoFactor(password.value)
    password.value = ''
  })

const confirm = () =>
  run(async () => {
    await api.verifyTotp(code.value.replace(/\s+/g, ''))
    backupCodes.value = enrolment.value?.backupCodes ?? []
    enrolment.value = null
    code.value = ''
    gate.value = null
    await refresh()
    toast.success(t('security.personal.enabled'))
  })

const disable = () =>
  run(async () => {
    await api.disableTwoFactor(password.value)
    password.value = ''
    backupCodes.value = null
    gate.value = null
    await refresh()
    toast.success(t('security.personal.disabled'))
  })

const copyUri = async (): Promise<void> => {
  if (!enrolment.value) return
  try {
    await navigator.clipboard.writeText(enrolment.value.totpUri)
    copied.value = true
  } catch (error) {
    console.error('[security] clipboard refused', error instanceof Error ? error.message : error)
  }
}
</script>

<template>
  <section class="grid gap-4 rounded-xl border bg-card px-5 py-5 shadow-xs sm:px-6" aria-labelledby="two-factor-title" data-testid="two-factor-panel">
    <div class="flex flex-wrap items-center gap-3">
      <h2 id="two-factor-title" class="text-base font-semibold">{{ t('security.personal.title') }}</h2>
      <Badge :variant="enabled ? 'success' : 'outline'" data-testid="two-factor-status">{{ enabled ? t('security.personal.statusOn') : t('security.personal.statusOff') }}</Badge>
    </div>
    <p class="text-sm text-pretty text-muted-foreground">{{ t('security.personal.description') }}</p>
    <p v-if="props.required && !enabled" role="alert" class="rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">{{ t('security.personal.required') }}</p>

    <div v-if="backupCodes" class="grid gap-2" data-testid="two-factor-backup-codes">
      <h3 class="text-sm font-semibold">{{ t('security.personal.backupTitle') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('security.personal.backupBody') }}</p>
      <ul class="grid grid-cols-2 gap-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm sm:grid-cols-3">
        <li v-for="item in backupCodes" :key="item" class="select-all">{{ item }}</li>
      </ul>
    </div>

    <form v-if="enrolment" class="grid gap-4" novalidate @submit.prevent="confirm">
      <p class="text-sm">{{ t('security.personal.scan') }}</p>
      <img v-if="qrCode" :src="qrCode" :alt="t('security.personal.qrAlt')" width="192" height="192" class="size-48 rounded-md border bg-white p-1" data-testid="two-factor-qr" />
      <div v-if="secret" class="grid gap-1">
        <span class="text-xs font-medium text-muted-foreground">{{ t('security.personal.secret') }}</span>
        <code class="rounded-md border bg-muted px-3 py-2 font-mono text-sm select-all" data-testid="two-factor-secret">{{ secret }}</code>
      </div>
      <div class="grid gap-1">
        <span class="text-xs font-medium text-muted-foreground">{{ t('security.personal.uri') }}</span>
        <div class="flex items-center gap-2">
          <a :href="enrolment.totpUri" class="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs" data-testid="two-factor-uri">{{ enrolment.totpUri }}</a>
          <Button type="button" variant="outline" size="sm" @click="copyUri">{{ copied ? t('security.personal.copied') : t('security.personal.copy') }}</Button>
        </div>
      </div>
      <FormField id="two-factor-code" :label="t('security.personal.code')">
        <template #default="{ describedBy }">
          <Input id="two-factor-code" v-model="code" autocomplete="one-time-code" inputmode="numeric" class="max-w-40 font-mono tracking-widest" :aria-describedby="describedBy" data-testid="two-factor-code" />
        </template>
      </FormField>
      <FormAlert :message-key="errorKey" />
      <div><Button type="submit" :disabled="busy || code.trim() === ''" data-testid="two-factor-confirm">{{ busy ? t('security.personal.confirming') : t('security.personal.confirm') }}</Button></div>
    </form>

    <form v-else class="grid gap-4" novalidate @submit.prevent="enabled ? disable() : start()">
      <FormField id="two-factor-password" :label="t('security.personal.password')" :hint="t('security.personal.passwordHint')">
        <template #default="{ describedBy }">
          <Input id="two-factor-password" v-model="password" type="password" autocomplete="current-password" class="max-w-sm" :aria-describedby="describedBy" data-testid="two-factor-password" />
        </template>
      </FormField>
      <FormAlert :message-key="errorKey" />
      <div>
        <Button type="submit" :variant="enabled ? 'outline' : 'default'" :disabled="busy || password === ''" data-testid="two-factor-submit">
          <template v-if="enabled">{{ busy ? t('security.personal.disabling') : t('security.personal.disable') }}</template>
          <template v-else>{{ busy ? t('security.personal.enabling') : t('security.personal.enable') }}</template>
        </Button>
      </div>
    </form>
  </section>
</template>
