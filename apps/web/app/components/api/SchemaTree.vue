<script setup lang="ts">
import type { SchemaNode } from '@/lib/openapi-reference'

/** A schema as an indented list of fields: name, type, required, allowed values, description. Recursive. */
defineProps<{ node: SchemaNode }>()
const { t } = useI18n()
</script>

<template>
  <ul v-if="node.fields.length > 0" class="grid gap-1.5 border-l border-border pl-3">
    <li v-for="field in node.fields" :key="field.name" class="grid gap-1">
      <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <code class="font-mono font-medium text-foreground">{{ field.name }}</code>
        <code class="font-mono text-muted-foreground">{{ field.node.label }}</code>
        <span v-if="field.required" class="font-medium text-foreground">{{ t('apiReference.required') }}</span>
        <span v-if="field.node.enumValues.length > 0" class="text-muted-foreground">{{ field.node.enumValues.join(', ') }}</span>
      </p>
      <p v-if="field.node.description" class="text-xs text-muted-foreground">{{ field.node.description }}</p>
      <SchemaTree v-if="field.node.fields.length > 0" :node="field.node" />
    </li>
  </ul>
  <p v-else class="text-xs text-muted-foreground"><code class="font-mono">{{ node.label }}</code><template v-if="node.enumValues.length > 0">: {{ node.enumValues.join(', ') }}</template></p>
</template>
