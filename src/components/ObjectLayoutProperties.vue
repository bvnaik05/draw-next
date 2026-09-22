<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { Shape } from '../canvas/selection'
import { bounds, isFreeDraw, isLine } from '../canvas/selection'
import PropertySection from './PropertySection.vue'

export type FramePatch = Partial<Record<'x' | 'y' | 'width' | 'height', number>>
export type AlignAction = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
export type FlipAxis = 'horizontal' | 'vertical'
type LayerAction = 'front' | 'forward' | 'backward' | 'back'

const props = defineProps<{
  shapes: Shape[]
  layerActions: Record<LayerAction, boolean>
  widthMode?: 'auto' | 'fixed'
}>()
const emit = defineEmits<{
  frame: [patch: FramePatch]
  widthMode: [mode: 'auto' | 'fixed']
  layer: [action: LayerAction]
  align: [action: AlignAction]
  flip: [axis: FlipAxis]
}>()

const frame = computedFrame()
const frameFields = [
  { key: 'x', label: 'Left' },
  { key: 'y', label: 'Top' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
] as const

const orderOptions = [
  { label: 'Send to back', action: 'back' as const, icon: ArrowDownToLine },
  { label: 'Send backward', action: 'backward' as const, icon: ChevronDown },
  { label: 'Bring forward', action: 'forward' as const, icon: ChevronUp },
  { label: 'Bring to front', action: 'front' as const, icon: ArrowUpToLine },
]
const horizontalAlignment = [
  { label: 'Align left', action: 'left' as const, icon: AlignStartVertical },
  { label: 'Align center', action: 'center-x' as const, icon: AlignCenterVertical },
  { label: 'Align right', action: 'right' as const, icon: AlignEndVertical },
]
const verticalAlignment = [
  { label: 'Align top', action: 'top' as const, icon: AlignStartHorizontal },
  { label: 'Align middle', action: 'center-y' as const, icon: AlignCenterHorizontal },
  { label: 'Align bottom', action: 'bottom' as const, icon: AlignEndHorizontal },
]

function computedFrame() {
  return computed(() => {
    const active = props.shapes.at(-1)
    if (props.shapes.length === 1 && active && !isLine(active) && !isFreeDraw(active)) {
      return { x: active.x, y: active.y, width: active.width, height: active.height }
    }
    return bounds(props.shapes)
  })
}

function displayValue(value: number | undefined) {
  return value === undefined ? '' : String(Math.round(value * 10) / 10)
}

function updateFrame(key: keyof FramePatch, event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  emit('frame', { [key]: value })
}
</script>

<template>
  <PropertySection title="Frame">
    <div class="frame-fields">
      <label v-for="field in frameFields" :key="field.key" class="frame-field">
        <span>{{ field.label }}</span>
        <span class="frame-input">
          <input
            type="number"
            step="1"
            :min="field.key === 'width' || field.key === 'height' ? 1 : undefined"
            :value="displayValue(frame?.[field.key])"
            :aria-label="field.label"
            @change="updateFrame(field.key, $event)"
            @keydown.enter.prevent="updateFrame(field.key, $event)"
          />
          <span>px</span>
        </span>
      </label>
    </div>
    <div v-if="widthMode" class="property-row">
      <span>Width Mode</span>
      <div class="segmented-control" role="group" aria-label="Width mode">
        <button type="button" :class="{ active: widthMode === 'auto' }" @click="emit('widthMode', 'auto')">Auto</button>
        <button type="button" :class="{ active: widthMode === 'fixed' }" @click="emit('widthMode', 'fixed')">Fixed</button>
      </div>
    </div>
  </PropertySection>

  <PropertySection title="Arrange">
    <div class="property-row">
      <span>Order</span>
      <div class="icon-actions">
        <button v-for="option in orderOptions" :key="option.label" type="button" :aria-label="option.label" :disabled="!layerActions[option.action]" @click="emit('layer', option.action)">
          <component :is="option.icon" :stroke-width="1.5" />
        </button>
      </div>
    </div>
    <div class="property-row">
      <span>Align Horizontal</span>
      <div class="icon-actions">
        <button v-for="option in horizontalAlignment" :key="option.label" type="button" :aria-label="option.label" @click="emit('align', option.action)">
          <component :is="option.icon" :stroke-width="1.5" />
        </button>
      </div>
    </div>
    <div class="property-row">
      <span>Align Vertical</span>
      <div class="icon-actions">
        <button v-for="option in verticalAlignment" :key="option.label" type="button" :aria-label="option.label" @click="emit('align', option.action)">
          <component :is="option.icon" :stroke-width="1.5" />
        </button>
      </div>
    </div>
    <div class="property-row">
      <span>Flip</span>
      <div class="icon-actions">
        <button type="button" aria-label="Flip horizontal" @click="emit('flip', 'horizontal')"><FlipHorizontal :stroke-width="1.5" /></button>
        <button type="button" aria-label="Flip vertical" @click="emit('flip', 'vertical')"><FlipVertical :stroke-width="1.5" /></button>
      </div>
    </div>
  </PropertySection>
</template>

<style scoped>
.frame-fields { display: flex; flex-direction: column; gap: 8px; }
.frame-field, .property-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink-gray-6); font-size: 14px; line-height: 20px; }
.frame-input { display: flex; width: 118px; align-items: center; justify-content: flex-end; gap: 4px; color: var(--ink-gray-5); }
.frame-input input { width: 86px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink-gray-8); font: inherit; text-align: right; }
.frame-input input:focus-visible { border-radius: 4px; outline: 2px solid var(--outline-blue-2); outline-offset: 2px; }
.segmented-control { display: flex; padding: 2px; border-radius: 10px; background: var(--surface-gray-2); }
.segmented-control button { padding: 4px 9px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-gray-6); font: inherit; cursor: pointer; }
.segmented-control button.active { background: var(--surface-base); box-shadow: var(--shadow-xs); color: var(--ink-gray-8); }
.icon-actions { display: flex; align-items: center; gap: 4px; }
.icon-actions button { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink-gray-7); cursor: pointer; }
.icon-actions button:hover:not(:disabled), .icon-actions button:focus-visible { background: var(--surface-gray-2); color: var(--ink-gray-9); outline: none; }
.icon-actions button:disabled { color: var(--ink-gray-4); cursor: not-allowed; }
.icon-actions svg { width: 18px; height: 18px; }
</style>
