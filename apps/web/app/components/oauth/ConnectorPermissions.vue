<script setup lang="ts">
import { CheckIcon, ShieldCheckIcon } from '@lucide/vue'
import type { Role } from '@candydati/domain'
import { scopeGroups, scopeLabelKey } from '@/lib/api-keys'

/** What a connector can do as this person in this organization (their role minus what no machine may do), and what never. */
const props = defineProps<{ role: Role; organization: string }>()
const { t } = useI18n()
const groups = computed(() => scopeGroups(props.role, 'connected_app'))
</script>

<template>
  <div class="grid gap-3" data-testid="consent-permissions">
    <p class="text-sm font-medium">{{ t('oauth.consent.can', { role: t(`roles.${role}`), organization }) }}</p>
    <div v-for="group in groups" :key="group.area" class="grid gap-1.5">
      <p class="text-xs font-medium text-muted-foreground">{{ t(`apiKeys.areas.${group.area}`) }}</p>
      <ul class="grid gap-1 text-sm">
        <li v-for="scope in group.scopes" :key="scope" class="flex items-start gap-2" :data-scope="scope">
          <CheckIcon class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{{ t(scopeLabelKey(scope)) }}
        </li>
      </ul>
    </div>
    <p class="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground" data-testid="consent-never">
      <ShieldCheckIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ t('oauth.consent.never') }}
    </p>
    <p class="text-sm text-muted-foreground" data-testid="consent-as-you">{{ t('oauth.consent.asYou') }}</p>
  </div>
</template>
