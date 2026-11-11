<script setup lang="ts">
import { VideoIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * "La tua stanza video": a Meet, Zoom or Teams link the person reuses. Saved once, it becomes the link of the video
 * interviews they run, so a booked interview always says where to join.
 */
const { t } = useI18n()
const v = useMyVideoRoom()
const url = ref('')
const busy = computed(() => v.busy.value !== null)
watch(
  () => v.room.value?.url,
  (saved) => {
    url.value = saved ?? ''
  },
  { immediate: true },
)
const save = async (): Promise<void> => {
  await v.save(url.value.trim())
}
</script>

<template>
  <section class="grid max-w-2xl gap-4" aria-labelledby="video-room-title" data-testid="video-room-panel">
    <div class="grid gap-1">
      <h2 id="video-room-title" class="flex items-center gap-2 text-lg font-semibold tracking-tight"><VideoIcon class="size-5" aria-hidden="true" />{{ t('videoRoom.title') }}</h2>
      <p class="text-sm text-pretty text-muted-foreground">{{ t('videoRoom.intro') }}</p>
    </div>
    <div v-if="v.errorKey.value" class="grid gap-3">
      <FormAlert :message-key="v.errorKey.value" />
      <div><Button variant="outline" @click="() => v.refresh()">{{ t('common.retry') }}</Button></div>
    </div>
    <Skeleton v-else-if="!v.room.value" class="h-24 w-full" aria-busy="true" />
    <form v-else class="grid gap-3" novalidate data-testid="video-room-form" @submit.prevent="save">
      <FormField id="video-room-url" :label="t('videoRoom.label')" :hint="t('videoRoom.hint')">
        <template #default="{ describedBy }">
          <Input id="video-room-url" v-model="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://meet.google.com/…" :aria-describedby="describedBy" :disabled="busy" required data-testid="video-room-url" />
        </template>
      </FormField>
      <p v-if="v.room.value.provider" class="text-sm text-muted-foreground" data-testid="video-room-saved">{{ t('videoRoom.current', { provider: t(`videoRoom.providers.${v.room.value.provider}`) }) }}</p>
      <FormAlert :message-key="v.actionErrorKey.value" />
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="busy || url.trim() === ''" data-testid="video-room-save">{{ v.busy.value === 'save' ? t('videoRoom.saving') : t('videoRoom.save') }}</Button>
        <Button v-if="v.room.value.url" type="button" variant="outline" :disabled="busy" data-testid="video-room-remove" @click="() => v.remove()">{{ t('videoRoom.remove') }}</Button>
      </div>
    </form>
  </section>
</template>
