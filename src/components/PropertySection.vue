<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: true })
</script>

<template>
  <details class="property-section" :open="open">
    <summary>
      <h2>{{ title }}</h2>
      <ChevronRight class="property-section__chevron" :stroke-width="1.5" aria-hidden="true" />
    </summary>
    <div class="property-section__content">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.property-section { border-bottom: 1px solid var(--outline-gray-1); }
summary { display: flex; align-items: center; justify-content: space-between; padding: 12px; color: var(--ink-gray-8); cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid var(--outline-blue-2); outline-offset: -2px; }
h2 { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.property-section__chevron { width: 14px; height: 14px; flex: 0 0 auto; color: var(--ink-gray-5); transition: transform 120ms ease; }
.property-section[open] .property-section__chevron { transform: rotate(90deg); }
.property-section__content { display: flex; flex-direction: column; gap: 14px; padding: 0 12px 12px; }

@media (prefers-reduced-motion: reduce) {
  .property-section__chevron { transition: none; }
}
</style>
