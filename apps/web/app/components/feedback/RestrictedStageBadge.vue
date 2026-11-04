<script setup lang="ts">
import { LockIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

/** Feedback or a request at a restricted stage (PRODUCT.md §6.2): read only by owners, admins, the hiring manager and its author. */
const { t } = useI18n()
</script>

<template>
  <Badge variant="outline" :title="t('feedback.tab.restrictedHint')" data-testid="feedback-restricted"><LockIcon aria-hidden="true" />{{ t('feedback.tab.restricted') }}</Badge>
</template>
