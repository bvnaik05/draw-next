<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Pipette } from 'lucide-vue-next'
import { Button } from 'frappe-ui'
import Popover from 'frappe-ui/src/components/Popover/Popover.vue'
import TextInput from 'frappe-ui/src/components/TextInput/TextInput.vue'

type Family = { name: string; base: string; shades: string[] }

const props = defineProps<{ color: string; label: string; target: 'border' | 'fill' }>()
const emit = defineEmits<{ select: [color: string] }>()

const families: Family[] = [
  { name: 'Gray', base: '#383838', shades: ['#f3f3f3', '#e2e2e2', '#999999', '#525252', '#171717'] },
  { name: 'Blue', base: '#0289f7', shades: ['#e6f4ff', '#a7d7fd', '#0289f7', '#0070cc', '#004880'] },
  { name: 'Green', base: '#30a66d', shades: ['#e4faeb', '#b9eecc', '#59ba8b', '#278f5e', '#173b2c'] },
  { name: 'Red', base: '#e03636', shades: ['#ffe7e7', '#fdc2c2', '#e03636', '#b52a2a', '#6b1515'] },
  { name: 'Orange', base: '#e86c13', shades: ['#ffefe4', '#ffcba3', '#e86c13', '#bd3e0c', '#6b2711'] },
  { name: 'Yellow', base: '#edba13', shades: ['#fff7d3', '#f5e171', '#edba13', '#ab6e05', '#733f12'] },
  { name: 'Purple', base: '#9c45e3', shades: ['#f6e9ff', '#e2b9fc', '#9c45e3', '#6e399d', '#401863'] },
  { name: 'Pink', base: '#e34aa6', shades: ['#fde8f5', '#f9b9e0', '#e34aa6', '#9c2671', '#570f3e'] },
  { name: 'Teal', base: '#36baad', shades: ['#e6f7f4', '#97ded4', '#36baad', '#0f736b', '#114541'] },
  { name: 'Cyan', base: '#3bbde5', shades: ['#ddf7ff', '#99e2f8', '#3bbde5', '#267a94', '#164759'] },
  { name: 'Amber', base: '#e79913', shades: ['#fff7d3', '#fbdb73', '#e79913', '#b35309', '#763813'] },
  { name: 'Violet', base: '#6846e3', shades: ['#f0ebff', '#c9bafb', '#6846e3', '#4f3da1', '#251959'] },
  { name: 'Lime', base: '#8db20c', shades: ['#f3fadf', '#dfeeb2', '#a9cf4d', '#6f8b0a', '#374505'] },
  { name: 'Brown', base: '#9a624a', shades: ['#f7eee9', '#e8c8b8', '#b97c62', '#744532', '#3d2117'] },
  { name: 'Rose', base: '#e6577a', shades: ['#ffeaef', '#ffc4d2', '#e6577a', '#b73455', '#651526'] },
]

const recent = ref(['#383838', '#0289f7', '#30a66d', '#e86c13', '#9c45e3'])
const family = ref(families[6]!)
const hex = ref(props.color)
const shades = computed(() => family.value.shades)
const palette = computed(() => families.map(family => ({ family, color: family.shades[props.target === 'fill' ? 1 : 3] })))
const shadeLabel = computed(() => `${family.value.name} shades`)

watch(() => props.color, selectExistingFamily, { immediate: true })

function selectExistingFamily(color: string) {
  hex.value = color
  family.value = families.find(option => option.base === color || option.shades.includes(color)) ?? family.value
}

function selectColor(color: string, nextFamily = families.find(option => option.base === color)) {
  if (nextFamily) family.value = nextFamily
  hex.value = color
  recent.value = [color, ...recent.value.filter(value => value !== color)].slice(0, 5)
  emit('select', color)
}

function updateHex(value: string) {
  hex.value = value
  if (/^#[0-9a-f]{6}$/i.test(value)) selectColor(value)
}

async function pickScreenColor() {
  const Picker = (window as typeof window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
  if (!Picker) return
  try { selectColor((await new Picker().open()).sRGBHex) } catch { /* picker cancelled */ }
}
</script>

<template>
  <span class="color-trigger-anchor">
    <Popover side="left" align="start" :offset="20" :collision-padding="16" arrow>
      <template #trigger>
        <Button class="color-trigger" size="xs" variant="ghost" theme="gray" :style="{ '--color': color }" :label="label" :tooltip="label" />
      </template>
      <div class="color-picker">
        <section>
          <h3>Most used custom colors</h3>
          <div class="color-row">
            <button v-for="color in recent" :key="color" :style="{ background: color }" :aria-label="color" @click="selectColor(color)" />
          </div>
        </section>
        <section>
          <h3>Colors</h3>
          <div class="color-grid">
            <button v-for="option in palette" :key="option.family.name" :class="{ selected: family.name === option.family.name }" :style="{ background: option.color }" :aria-label="option.family.name" @click="selectColor(option.color, option.family)" />
          </div>
        </section>
        <section>
          <h3>{{ shadeLabel }}</h3>
          <div class="color-row">
            <button v-for="color in shades" :key="color" :class="{ selected: color === hex }" :style="{ background: color }" :aria-label="color" @click="selectColor(color)" />
          </div>
        </section>
        <TextInput class="hex-field" :model-value="hex.slice(1)" size="sm" variant="outline" aria-label="Custom hex color" maxlength="6" @update:model-value="updateHex(`#${$event.replace(/^#/, '')}`)">
          <template #prefix><span class="hex-prefix">#</span></template>
          <template #suffix>
            <Button size="xs" variant="ghost" theme="gray" label="Color Picker" tooltip="Color Picker" @click="pickScreenColor"><Pipette :stroke-width="1.5" /></Button>
          </template>
        </TextInput>
      </div>
    </Popover>
  </span>
</template>

<style scoped>
.color-trigger-anchor { display: contents; }
.color-trigger-anchor :deep(.color-trigger) { width: 26px !important; height: 26px !important; padding: 0; border-radius: 5px !important; background: var(--color) !important; }
.color-trigger-anchor :deep(.color-trigger .truncate) { display: none; }
.color-picker { width: 264px; padding: 18px; color: var(--ink-gray-7); }
.color-picker section + section { margin-top: 16px; }
h3 { margin: 0 0 8px; color: var(--ink-gray-7); font-size: 13px; font-weight: 400; line-height: 20px; }
.color-row, .color-grid { display: grid; grid-template-columns: repeat(5, 34px); gap: 6px; }
.color-row button, .color-grid button { width: 34px; height: 34px; padding: 0; border: 0; border-radius: 6px; cursor: pointer; }
.color-row button:hover, .color-grid button:hover { outline: 1px solid var(--outline-gray-4); outline-offset: 1px; }
.color-row button:focus-visible, .color-grid button:focus-visible, .color-row button.selected, .color-grid button.selected { outline: 2px solid var(--surface-blue-2); outline-offset: 2px; }
.color-picker :deep(.hex-field) { margin-top: 16px; }
.color-picker :deep(.hex-field input) { font-weight: 400; line-height: 20px; }
.color-picker :deep(.hex-prefix) { display: flex; width: 24px; height: 24px; align-items: center; justify-content: center; }
</style>
