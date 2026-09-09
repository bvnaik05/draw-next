<script setup lang="ts">
import TextInput from 'frappe-ui/src/components/TextInput/TextInput.vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import drawLogo from './assets/draw-logo.svg'
import type { DrawingTool } from './canvas/tools'
import DrawingToolbar from './components/DrawingToolbar.vue'
import InfiniteCanvas from './components/InfiniteCanvas.vue'

const title = ref('Untitled Drawing')
const editingTitle = ref(false)
const titleInput = ref<{ el: HTMLInputElement | null } | null>(null)
const activeTool = ref<DrawingTool | null>('select')

function startRenaming() {
  editingTitle.value = true
  nextTick(() => {
    titleInput.value?.el?.focus()
    titleInput.value?.el?.select()
  })
}

function finishRenaming() {
  editingTitle.value = false
}

function selectTool(tool: DrawingTool) {
  activeTool.value = tool
}

function finishTool() {
  activeTool.value = 'select'
}

function onToolShortcut(event: KeyboardEvent) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
  if (event.key.toLowerCase() === 't') {
    event.preventDefault()
    selectTool('text')
  } else if (event.key === 'Escape') finishTool()
}

function isPageZoomShortcut(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  return ['+', '-', '=', '0', 'Add', 'Subtract'].includes(event.key)
}

function preventPageZoom(event: WheelEvent | KeyboardEvent) {
  if (event instanceof WheelEvent) {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
    return
  }
  if (isPageZoomShortcut(event)) event.preventDefault()
}

function preventPagePinch(event: Event) {
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('wheel', preventPageZoom, { capture: true, passive: false })
  window.addEventListener('keydown', preventPageZoom, true)
  window.addEventListener('keydown', onToolShortcut, true)
  window.addEventListener('gesturestart', preventPagePinch, { passive: false })
  window.addEventListener('gesturechange', preventPagePinch, { passive: false })
})

onBeforeUnmount(() => {
  window.removeEventListener('wheel', preventPageZoom, true)
  window.removeEventListener('keydown', preventPageZoom, true)
  window.removeEventListener('keydown', onToolShortcut, true)
  window.removeEventListener('gesturestart', preventPagePinch)
  window.removeEventListener('gesturechange', preventPagePinch)
})
</script>

<template>
  <main class="app-shell">
    <header class="drawing-header" aria-label="Drawing header">
      <div class="header-side header-left">
        <img class="draw-logo" :src="drawLogo" alt="Draw" width="24" height="24" />
      </div>
      <h1 class="drawing-title">
        <TextInput
          v-if="editingTitle"
          ref="titleInput"
          v-model="title"
          class="title-field"
          aria-label="Drawing title"
          spellcheck="false"
          variant="outline"
          @blur="finishRenaming"
          @keyup.enter="finishRenaming"
        />
        <button
          v-else
          class="title-button"
          type="button"
          aria-label="Rename drawing"
          @click="startRenaming"
        >
          {{ title }}
        </button>
      </h1>
      <div class="header-side" aria-hidden="true" />
    </header>
    <DrawingToolbar :active-tool="activeTool" @select="selectTool" />
    <InfiniteCanvas
      :active-tool="activeTool"
      @activate-rectangle="activeTool = 'rectangle'"
      @activate-ellipse="activeTool = 'ellipse'"
      @activate-line="activeTool = 'line'"
      @activate-text="activeTool = 'text'"

      @cancel-tool="activeTool = 'select'"
      @rectangle-created="finishTool"
      @ellipse-created="finishTool"
      @line-created="finishTool"
    />
  </main>
</template>
