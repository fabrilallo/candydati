<script setup lang="ts">
import { ImageIcon, LinkIcon, Trash2Icon } from '@lucide/vue'
import { organizationLogoSourceSchema, type OrganizationLogoSource } from '@candydati/domain'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initials } from '@/lib/initials'
import { safeLogoUrl } from '@/lib/safe-url'

/**
 * The organization's logo: an image of the library (chosen or uploaded through the same dialog as the sections) or an
 * https address. Unlike the page, it is not a draft: it changes at once on the careers page, the ads and the app.
 */
const props = defineProps<{ organizationName: string }>()
const { t } = useI18n()
const editor = useCareersEditor()
const logo = useOrganizationLogo()

const errorKey = ref<string | null>(null)
const urlOpen = ref(logo.source.value?.kind === 'url')
const address = ref(logo.source.value?.kind === 'url' ? logo.source.value.url : '')
watch(logo.source, (source) => {
  if (source?.kind !== 'url') return
  address.value = source.url
  urlOpen.value = true
})

const apply = async (source: OrganizationLogoSource | null, doneKey: string): Promise<void> => {
  errorKey.value = await logo.set(source)
  if (errorKey.value === null) toast.success(t(doneKey))
}
const choose = (): void => editor.value.pick('image', (asset) => void apply({ kind: 'media', mediaId: asset.id }, 'careersEditor.logo.saved'))
const useAddress = async (): Promise<void> => {
  const parsed = organizationLogoSourceSchema.safeParse({ kind: 'url', url: address.value.trim() })
  if (!parsed.success) {
    errorKey.value = 'careersEditor.logo.errors.url'
    return
  }
  await apply(parsed.data, 'careersEditor.logo.saved')
}
const remove = (): Promise<void> => apply(null, 'careersEditor.logo.removed')
</script>

<template>
  <section class="grid gap-4 rounded-xl border bg-card px-5 py-5 sm:px-6" aria-labelledby="cp-logo-title" data-testid="careers-logo">
    <div class="grid gap-1">
      <h2 id="cp-logo-title" class="text-base font-semibold tracking-tight">{{ t('careersEditor.logo.title') }}</h2>
      <p class="max-w-prose text-sm text-muted-foreground">{{ t('careersEditor.logo.hint') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <div class="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
        <img v-if="logo.url.value" :src="safeLogoUrl(logo.url.value) ?? undefined" :alt="t('careersEditor.logo.current')" class="size-full object-contain p-1.5" referrerpolicy="no-referrer" data-testid="careers-logo-image">
        <span v-else class="text-sm font-semibold text-muted-foreground" aria-hidden="true">{{ initials(props.organizationName) }}</span>
      </div>
      <div class="grid min-w-0 flex-1 gap-2">
        <p v-if="!logo.source.value" class="text-sm text-muted-foreground">{{ t('careersEditor.logo.none') }}</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" :disabled="logo.busy.value" data-testid="careers-logo-choose" @click="choose">
            <ImageIcon class="size-4" aria-hidden="true" />
            {{ t(logo.source.value?.kind === 'media' ? 'careersEditor.logo.replace' : 'careersEditor.logo.choose') }}
          </Button>
          <Button v-if="logo.source.value" variant="ghost" size="sm" :disabled="logo.busy.value" data-testid="careers-logo-remove" @click="remove">
            <Trash2Icon class="size-4" aria-hidden="true" />
            {{ t('careersEditor.logo.remove') }}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('careersEditor.logo.tip') }}</p>
      </div>
    </div>

    <div class="grid gap-2">
      <Button v-if="!urlOpen" variant="link" class="h-auto justify-self-start px-0 has-[>svg]:px-0" data-testid="careers-logo-url-toggle" @click="urlOpen = true">
        <LinkIcon class="size-4" aria-hidden="true" />
        {{ t('careersEditor.logo.useUrl') }}
      </Button>
      <form v-else class="grid gap-1.5" novalidate @submit.prevent="useAddress">
        <Label for="cp-logo-url">{{ t('careersEditor.logo.urlLabel') }}</Label>
        <div class="flex flex-wrap gap-2">
          <Input id="cp-logo-url" v-model="address" type="url" inputmode="url" placeholder="https://" class="min-w-0 flex-1" spellcheck="false" :aria-invalid="errorKey === 'careersEditor.logo.errors.url' || undefined" data-testid="careers-logo-url" />
          <Button type="submit" variant="outline" :disabled="logo.busy.value || address.trim() === ''" data-testid="careers-logo-url-apply">{{ t('careersEditor.logo.urlApply') }}</Button>
        </div>
      </form>
    </div>

    <FormAlert :message-key="errorKey ?? logo.errorKey.value" />
  </section>
</template>
