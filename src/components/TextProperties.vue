<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, Italic, Strikethrough, Underline } from 'lucide-vue-next'
import { Button } from 'frappe-ui'
import Select from 'frappe-ui/src/components/Select/Select.vue'
import Slider from 'frappe-ui/src/components/Slider/Slider.vue'
import Tooltip from 'frappe-ui/src/components/Tooltip/Tooltip.vue'
import TooltipProvider from 'frappe-ui/src/components/Tooltip/TooltipProvider.vue'
import type { TextAlign, TextFontFamily, TextFontWeight, TextShape } from '../canvas/scene'
import ShapeColorPicker from './ShapeColorPicker.vue'

type LayerAction = 'front' | 'forward' | 'backward' | 'back'
type TextStylePatch = Partial<Pick<TextShape, 'fill' | 'fontFamily' | 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textAlign' | 'opacity' | 'fontSize'>>

const props = defineProps<{ texts: TextShape[]; layerActions: Record<LayerAction, boolean> }>()
const emit = defineEmits<{ preview: [patch: TextStylePatch]; style: [patch: TextStylePatch]; layer: [action: LayerAction] }>()

const active = computed(() => props.texts.at(-1))
const style = computed(() => ({
  fill: active.value?.fill ?? '#171717',
  fontFamily: active.value?.fontFamily ?? 'shantell' as TextFontFamily,
  fontWeight: active.value?.fontWeight ?? 400 as TextFontWeight,
  fontStyle: active.value?.fontStyle ?? 'normal' as const,
  textDecoration: active.value?.textDecoration ?? 'none' as const,
  textAlign: active.value?.textAlign ?? 'left' as TextAlign,
  fontSize: active.value?.fontSize ?? 16,
  opacity: active.value?.opacity ?? 1,
}))
const opacity = ref([100])
const opacityLabel = computed(() => `${opacity.value[0] ?? 100}%`)
const fontOptions = [
  { label: 'Shantell', value: 'shantell' },
  { label: 'Inter', value: 'inter' },
  { label: 'Georgia', value: 'georgia' },
  { label: 'Monospace', value: 'mono' },
] satisfies { label: string; value: TextFontFamily }[]
const fontSizeOptions = [12, 14, 16, 18, 20, 24, 32, 48].map(value => ({ label: `${value}`, value }))
watch(style, value => {
  opacity.value = [Math.round(value.opacity * 100)]
}, { immediate: true })

function selectColor(color: string | undefined) { emit('style', { fill: color }) }
function previewOpacity(value: number[]) { emit('preview', { opacity: (value[0] ?? 100) / 100 }) }
</script>

<template>
  <aside v-if="texts.length" class="text-properties" aria-label="Text properties" @pointerdown.stop @dblclick.stop>
    <TooltipProvider>
      <section>
        <div class="type-fields">
          <div><p>Font</p><Select :model-value="style.fontFamily" :options="fontOptions" variant="outline" size="sm" class="w-full" aria-label="Font family" @update:model-value="emit('style', { fontFamily: $event as TextFontFamily })" /></div>
          <div><p>Size</p><Select :model-value="style.fontSize" :options="fontSizeOptions" variant="outline" size="sm" class="w-full" aria-label="Font size" @update:model-value="emit('style', { fontSize: $event as number })" /></div>
        </div>
      </section>
      <section>
        <h2>Format text</h2>
        <div class="options format-options" role="group" aria-label="Text formatting">
          <Tooltip text="Bold" placement="top"><Button size="xs" variant="subtle" :theme="style.fontWeight >= 600 ? 'blue' : 'gray'" label="Bold" @click="emit('style', { fontWeight: style.fontWeight >= 600 ? 400 : 600 })"><Bold :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Italic" placement="top"><Button size="xs" variant="subtle" :theme="style.fontStyle === 'italic' ? 'blue' : 'gray'" label="Italic" @click="emit('style', { fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })"><Italic :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Underline" placement="top"><Button size="xs" variant="subtle" :theme="style.textDecoration === 'underline' ? 'blue' : 'gray'" label="Underline" @click="emit('style', { textDecoration: style.textDecoration === 'underline' ? 'none' : 'underline' })"><Underline :stroke-width="1.5" /></Button></Tooltip>
          <Tooltip text="Strikethrough" placement="top"><Button size="xs" variant="subtle" :theme="style.textDecoration === 'line-through' ? 'blue' : 'gray'" label="Strikethrough" @click="emit('style', { textDecoration: style.textDecoration === 'line-through' ? 'none' : 'line-through' })"><Strikethrough :stroke-width="1.5" /></Button></Tooltip>
        </div>
      </section>
      <section>
        <h2>Align</h2>
        <div class="options" role="group" aria-label="Text alignment">
          <Tooltip v-for="option in [{ value: 'left', label: 'Align left', icon: AlignLeft }, { value: 'center', label: 'Align center', icon: AlignCenter }, { value: 'right', label: 'Align right', icon: AlignRight }, { value: 'justify', label: 'Justify', icon: AlignJustify }]" :key="option.value" :text="option.label" placement="top">
            <Button size="xs" variant="subtle" :theme="style.textAlign === option.value ? 'blue' : 'gray'" :label="option.label" @click="emit('style', { textAlign: option.value as TextAlign })"><component :is="option.icon" :stroke-width="1.5" /></Button>
          </Tooltip>
        </div>
      </section>
      <section>
        <h2>Text color</h2>
        <div class="swatches" role="group" aria-label="Text color">
          <ShapeColorPicker :color="style.fill" label="Custom text color" target="fill" @select="selectColor" />
          <span class="divider" />
          <Tooltip v-for="color in [{ name: 'Gray', hex: '#525252' }, { name: 'Blue', hex: '#0070cc' }, { name: 'Green', hex: '#278f5e' }, { name: 'Red', hex: '#b52a2a' }, { name: 'Orange', hex: '#bd3e0c' }]" :key="color.hex" :text="`${color.name}: ${color.hex}`" placement="top">
            <Button class="swatch" size="xs" variant="ghost" theme="gray" :class="{ selected: style.fill === color.hex }" :style="{ '--swatch': color.hex }" :label="color.name" @click="selectColor(color.hex)" />
          </Tooltip>
        </div>
      </section>
      <section>
        <Slider v-model="opacity" size="sm" :aria-label="`Opacity ${opacityLabel}`" @update:model-value="previewOpacity" @value-commit="emit('style', { opacity: $event[0]! / 100 })">
          <template #label>Opacity <output>{{ opacityLabel }}</output></template>
        </Slider>
      </section>
      <section>
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
.text-properties { position: fixed; top: 112px; right: 16px; z-index: 2; width: 232px; padding: 16px; border: 1px solid var(--outline-gray-1); border-radius: 10px; background: var(--surface-base); box-shadow: var(--shadow-sm); color: var(--ink-gray-7); }
section + section { margin-top: 14px; }
h2, p { margin: 0 0 8px; color: var(--ink-gray-7); font-size: 13px; font-weight: 400; line-height: 20px; }
.type-fields { display: grid; grid-template-columns: minmax(0, 1fr) 64px; gap: 8px; }
.options, .swatches { display: flex; align-items: center; gap: 6px; }
.options svg { width: 16px; height: 16px; }
.swatch { flex: 0 0 auto; width: 26px !important; height: 26px !important; padding: 0; border-radius: 5px !important; background: var(--swatch) !important; }
.swatch :deep(.truncate) { display: none; }
.swatch.selected { outline: 1px solid var(--outline-blue-2); outline-offset: 1px; }
.divider { width: 1px; height: 20px; margin: 0 1px; background: var(--outline-gray-2); }
output { margin-left: auto; color: var(--ink-gray-6); font-weight: 400; font-variant-numeric: tabular-nums; }
:deep([data-slot='control'] [role='slider']) { width: 12px; height: 12px; }
</style>
