<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp } from 'lucide-vue-next'
import Tooltip from 'frappe-ui/src/components/Tooltip/Tooltip.vue'
import TooltipProvider from 'frappe-ui/src/components/Tooltip/TooltipProvider.vue'
import { Button } from 'frappe-ui'
import Slider from 'frappe-ui/src/components/Slider/Slider.vue'
import type { Shape } from '../canvas/selection'
import ShapeColorPicker from './ShapeColorPicker.vue'

type LayerAction = 'front' | 'forward' | 'backward' | 'back'
type StylePatch = { stroke?: string | null; fill?: string; strokeWidth?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted'; opacity?: number }
type Swatch = { name: string; hex: string }

const props = withDefaults(defineProps<{ shapes: Shape[]; layerActions: Record<LayerAction, boolean>; draw?: boolean; variable?: boolean }>(), { draw: false, variable: false })
const emit = defineEmits<{ preview: [patch: StylePatch]; style: [patch: StylePatch]; layer: [action: LayerAction]; pressure: [variable: boolean] }>()

const borderColors: Swatch[] = [
  { name: 'Blue', hex: '#0070cc' }, { name: 'Green', hex: '#278f5e' }, { name: 'Red', hex: '#b52a2a' }, { name: 'Orange', hex: '#bd3e0c' },
]
const fillColors: Swatch[] = [
  { name: 'Blue', hex: '#e6f4ff' }, { name: 'Green', hex: '#e4faeb' }, { name: 'Red', hex: '#ffe7e7' }, { name: 'Yellow', hex: '#fff7d3' },
]
const active = computed(() => props.shapes.at(-1))
const showFill = computed(() => !props.draw && props.shapes.some(shape => !('kind' in shape && (shape.kind === 'line' || shape.kind === 'arrow' || shape.kind === 'image'))))
const style = computed(() => ({
  stroke: active.value?.stroke ?? '#171717', hasStroke: active.value?.stroke !== null, fill: active.value && 'fill' in active.value ? active.value.fill : undefined,
  strokeWidth: active.value?.strokeWidth ?? 2, strokeStyle: active.value?.strokeStyle ?? 'solid', opacity: active.value?.opacity ?? 1,
}))
const opacity = ref([100])
const opacityLabel = computed(() => `${opacity.value[0] ?? 100}%`)

watch(() => style.value.opacity, value => { opacity.value = [Math.round(value * 100)] }, { immediate: true })

function selectColor(target: 'stroke' | 'fill', color: string | undefined) {
  emit('style', target === 'stroke' ? { stroke: color ?? null } : { fill: color })
}
function colorTitle(swatch: Swatch) { return `${swatch.name}: ${swatch.hex}` }
function previewOpacity(value: number[]) { emit('preview', { opacity: (value[0] ?? 100) / 100 }) }
</script>

<template>
  <aside v-if="shapes.length" class="shape-properties" aria-label="Shape properties" @pointerdown.stop @dblclick.stop>
    <TooltipProvider>
      <section>
        <h2>{{ draw ? 'Stroke' : 'Border' }}</h2>
        <div class="swatches" role="group" :aria-label="draw ? 'Stroke color' : 'Border color'">
          <ShapeColorPicker :color="style.stroke" :stroke-width="style.strokeWidth" :stroke-style="style.strokeStyle" :show-border-options="true" :label="draw ? 'Custom stroke color' : 'Custom border color'" target="border" @select="selectColor('stroke', $event)" @style="emit('style', $event)" />
          <span class="divider" />
          <Tooltip v-if="!draw" text="None" placement="top"><Button class="swatch none" size="xs" variant="ghost" theme="gray" :class="{ selected: !style.hasStroke }" label="No border" @click="selectColor('stroke', undefined)" /></Tooltip>
          <Tooltip v-for="color in borderColors" :key="color.hex" :text="colorTitle(color)" placement="top">
            <Button class="swatch" size="xs" variant="ghost" theme="gray" :class="{ selected: style.stroke === color.hex }" :style="{ '--swatch': color.hex }" :label="colorTitle(color)" @click="selectColor('stroke', color.hex)" />
          </Tooltip>
        </div>
      </section>
      <section v-if="showFill">
        <h2>Fill</h2>
        <div class="swatches" role="group" aria-label="Fill color">
          <ShapeColorPicker :color="style.fill ?? '#e6f4ff'" label="Custom fill color" target="fill" @select="selectColor('fill', $event)" />
          <span class="divider" />
          <Tooltip text="None" placement="top"><Button class="swatch none" size="xs" variant="ghost" theme="gray" :class="{ selected: !style.fill }" label="No fill" @click="selectColor('fill', undefined)" /></Tooltip>
          <Tooltip v-for="color in fillColors" :key="color.hex" :text="colorTitle(color)" placement="top"><Button class="swatch" size="xs" variant="ghost" theme="gray" :class="{ selected: style.fill === color.hex }" :style="{ '--swatch': color.hex }" :label="colorTitle(color)" @click="selectColor('fill', color.hex)" /></Tooltip>
        </div>
      </section>
      <section>
        <h2>{{ draw ? 'Stroke width' : 'Border width' }}</h2>
        <div class="options" role="group" aria-label="Border width">
          <Tooltip v-for="width in [1.5, 3, 5]" :key="width" :text="`${width}px border`" placement="top">
            <Button size="xs" variant="subtle" :theme="style.strokeWidth === width ? 'blue' : 'gray'" :label="`${width}px border`" @click="emit('style', { strokeWidth: width })">
              <svg class="stroke-preview" viewBox="0 0 24 12" aria-hidden="true"><path d="M3 6h18" :stroke-width="width" /></svg>
            </Button>
          </Tooltip>
        </div>
      </section>
      <section>
        <h2>{{ draw ? 'Stroke style' : 'Border style' }}</h2>
        <div class="options" role="group" :aria-label="draw ? 'Stroke style' : 'Border style'">
          <Tooltip v-for="option in ['solid', 'dashed', 'dotted'] as const" :key="option" :text="option" placement="top">
            <Button size="xs" variant="subtle" :theme="style.strokeStyle === option ? 'blue' : 'gray'" :label="option" @click="emit('style', { strokeStyle: option })">
              <svg class="stroke-preview" viewBox="0 0 24 12" aria-hidden="true"><path d="M3 6h18" :class="option" /></svg>
            </Button>
          </Tooltip>
        </div>
      </section>
      <section v-if="draw">
        <h2>Pressure</h2>
        <div class="options" role="group" aria-label="Pressure"><Button size="xs" variant="subtle" :theme="!variable ? 'blue' : 'gray'" label="Constant" @click="emit('pressure', false)" /><Button size="xs" variant="subtle" :theme="variable ? 'blue' : 'gray'" label="Variable" @click="emit('pressure', true)" /></div>
      </section>
      <section>
        <Slider v-model="opacity" size="sm" :aria-label="`Opacity ${opacityLabel}`" @update:model-value="previewOpacity" @value-commit="emit('style', { opacity: $event[0]! / 100 })">
          <template #label>Opacity <output>{{ opacityLabel }}</output></template>
        </Slider>
      </section>
      <section v-if="!draw">
        <h2>Layers</h2>
        <div class="options layers" role="group" aria-label="Layers">
          <Tooltip text="Send to back" placement="top"><Button size="xs" variant="subtle" theme="gray" label="Send to back" :disabled="!layerActions.back" @click="emit('layer', 'back')"><ArrowDownToLine :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Send backward" placement="top"><Button size="xs" variant="subtle" theme="gray" label="Send backward" :disabled="!layerActions.backward" @click="emit('layer', 'backward')"><ChevronDown :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Bring forward" placement="top"><Button size="xs" variant="subtle" theme="gray" label="Bring forward" :disabled="!layerActions.forward" @click="emit('layer', 'forward')"><ChevronUp :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Bring to front" placement="top"><Button size="xs" variant="subtle" theme="gray" label="Bring to front" :disabled="!layerActions.front" @click="emit('layer', 'front')"><ArrowUpToLine :stroke-width="1.5" /></Button></Tooltip>
        </div>
      </section>
    </TooltipProvider>
  </aside>
</template>

<style scoped>
.shape-properties { position: fixed; top: 112px; right: 16px; z-index: 2; width: 232px; padding: 16px; border: 1px solid var(--outline-gray-1); border-radius: 10px; background: var(--surface-base); box-shadow: var(--shadow-sm); color: var(--ink-gray-7); }
section + section { margin-top: 14px; }
h2, :deep(label) { margin: 0 0 8px; color: var(--ink-gray-7); font-size: 13px; font-weight: 400; line-height: 20px; }
.swatches, .options { display: flex; gap: 6px; align-items: center; }
.swatch { flex: 0 0 auto; width: 26px !important; height: 26px !important; padding: 0; border-radius: 5px !important; background: var(--swatch) !important; }
.swatch :deep(.truncate) { display: none; }
.swatch.selected { outline: 1px solid var(--outline-blue-2); outline-offset: 1px; }
.swatch.none { background: linear-gradient(45deg, rgb(82 82 82 / 50%) 25%, transparent 25%) 0 0 / 8px 8px, linear-gradient(-45deg, rgb(82 82 82 / 50%) 25%, transparent 25%) 0 4px / 8px 8px, linear-gradient(45deg, transparent 75%, rgb(82 82 82 / 50%) 75%) 4px -4px / 8px 8px, linear-gradient(-45deg, transparent 75%, rgb(82 82 82 / 50%) 75%) -4px 0 / 8px 8px, var(--surface-base) !important; }
.divider { width: 1px; height: 20px; margin: 0 1px; background: var(--outline-gray-2); }
.stroke-preview { display: block; width: 24px; height: 12px; color: currentColor; }
.stroke-preview path { fill: none; stroke: currentColor; stroke-linecap: round; }
.stroke-preview path.dashed { stroke-dasharray: 5 3; }
.stroke-preview path.dotted { stroke-dasharray: 1 3; stroke-linecap: round; stroke-width: 2; }
.layers svg { width: 16px; height: 16px; }
output { margin-left: auto; color: var(--ink-gray-6); font-weight: 400; font-variant-numeric: tabular-nums; }
:deep([data-slot='control'] [role='slider']) { width: 12px; height: 12px; }
</style>
