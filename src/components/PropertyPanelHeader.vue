<script setup lang="ts">
import { LockKeyhole } from 'lucide-vue-next'

defineProps<{ title: string }>()
</script>

<template>
  <header class="property-panel-header">
    <span>{{ title }}</span>
    <LockKeyhole :stroke-width="1.5" aria-label="Lock object" title="Lock object" />
  </header>
</template>

<style scoped>
.property-panel-header { display: flex; min-height: 72px; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--outline-gray-1); color: var(--ink-gray-7); font-size: 20px; line-height: 28px; }
.property-panel-header svg { width: 18px; height: 18px; color: var(--ink-gray-6); }
</style>
