<script setup lang="ts">
import { BracesIcon } from '@lucide/vue'
import { TEMPLATE_VARIABLES, type TemplateVariable } from '@candydati/domain'
import { variableToken } from '@/lib/template-text'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** The known variables, by readable name; picking one inserts `{{ variable }}` where the caret was. */
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ insert: [token: string] }>()
const { t } = useI18n()
const labelOf = (name: TemplateVariable): string => t(`messages.variables.${name}`)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button type="button" variant="ghost" size="sm" :disabled="disabled" data-testid="variable-picker"><BracesIcon aria-hidden="true" />{{ t('messages.variables.insert') }}</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-72">
      <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('messages.variables.hint') }}</DropdownMenuLabel>
      <DropdownMenuItem v-for="name in TEMPLATE_VARIABLES" :key="name" :data-testid="`variable-${name}`" @select="emit('insert', variableToken(name))">
        <span class="min-w-0 flex-1 truncate">{{ labelOf(name) }}</span>
        <code class="font-mono text-xs text-muted-foreground">{{ name }}</code>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
