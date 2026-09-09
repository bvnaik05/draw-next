<script setup lang="ts">
import { Button } from 'frappe-ui'
import Tooltip from 'frappe-ui/src/components/Tooltip/Tooltip.vue'
import TooltipProvider from 'frappe-ui/src/components/Tooltip/TooltipProvider.vue'
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  MAX_SCALE,
  MIN_SCALE,
  dotInterval,
  nextZoomStep,
  positiveModulo,
  resizeAroundCenter,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Point,
  type Viewport,
} from '../canvas/geometry'
import {
  ellipseFromPoints,
  lineFromPoints,
  rectangleFromPoints,
  type LineShape,
  type RectangleShape,
  type TextShape,
} from '../canvas/scene'
import {
  containsPoint,
  moveRectangle,
  rectangleCenter,
  rectangleCorners,
  rotatePoint,
  rotateRectangle,
  resizeFromEdge,
  resizeFromCorner,
  setCornerRadius,
  type Corner,
  type Edge,
} from '../canvas/rectangle-interactions'
import { moveLine, rotateLineEndpoint, type LineEndpoint } from '../canvas/line-interactions'
import {
  snapResizeHandlePoint,
  snapShapeMove,
  type AlignmentGuide,
  type SpacingMarker,
} from '../canvas/snapping'
import type { DrawingTool } from '../canvas/tools'
import { layoutText, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT } from '../canvas/text-layout'
import SnapGuides from './SnapGuides.vue'

type PointerSample = Point & { pointerType: string }

const props = defineProps<{ activeTool: DrawingTool | null }>()
const emit = defineEmits<{
  activateRectangle: []
  activateEllipse: []
  activateLine: []
  activateText: []
  cancelTool: []
  rectangleCreated: []
  ellipseCreated: []
  lineCreated: []
}>()

const root = ref<HTMLElement>()
const size = reactive<Point>({ x: 0, y: 0 })
const viewport = reactive<Viewport>({ translationX: 0, translationY: 0, scale: 1 })
const pointers = new Map<number, PointerSample>()
const isPanning = ref(false)
const isSpacePressed = ref(false)
const isShiftPressed = ref(false)
const awaitingTouchRelease = ref(false)
const liveMessage = ref('Zoom 100%')
const rectangles = ref<(RectangleShape | TextShape)[]>([])
const lines = ref<LineShape[]>([])
const history: SceneSnapshot[] = [{ rectangles: [], lines: [] }]
const pendingRectangle = ref<RectangleShape>()
const pendingLine = ref<LineShape>()
const pendingText = ref<RectangleShape>()
const textEditor = ref<TextEditor>()
const textArea = ref<HTMLTextAreaElement>()
const selectedRectangleId = ref<string>()
const selectedLineId = ref<string>()
const selectedShapeIds = ref<string[]>([])
const hoveredSelectionHandle = ref<SelectionHandle>()
const isRotating = ref(false)
const isMoveReady = ref(false)
const isHoveringSelectedShape = ref(false)
const alignmentGuides = ref<AlignmentGuide[]>([])
const spacingMarkers = ref<SpacingMarker[]>([])
const latestGesturePoint = ref<Point>()

let resizeObserver: ResizeObserver | undefined
let singlePointerStart: { point: Point; viewport: Viewport } | undefined
let pinchStart:
  | { distance: number; centroid: Point; viewport: Viewport }
  | undefined
let announceTimer: number | undefined
let viewportFrame: number | undefined
let pendingViewport: Viewport | undefined
let pendingZoomAnnouncement = false
let clipboard: RectangleShape | TextShape | LineShape | undefined
let rectangleGesture: { pointerId: number; start: Point } | undefined
let lineGesture: { pointerId: number; start: Point } | undefined
let textGesture: { pointerId: number; start: Point; end?: Point } | undefined
let historyIndex = 0
type SceneSnapshot = { rectangles: (RectangleShape | TextShape)[]; lines: LineShape[] }
type TextEditor = {
  kind: 'text' | 'label'
  text: string
  shapeId?: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  wrap: boolean
  original?: TextShape | RectangleShape
}
type ResizeHandle = Corner | Edge
type CurveHandle = `curve-${Corner}`
type SelectionHandle = ResizeHandle | CurveHandle | 'rotate'
const HANDLE_HIT_RADIUS = 14
const LINE_HIT_RADIUS = 10
const TEXT_DRAG_THRESHOLD = 6
const TEXT_VIEWPORT_INSET = 32
const AUTO_PAN_EDGE = 48
const AUTO_PAN_SPEED = 12
const LABEL_PADDING = 12
const MIN_LABEL_FONT_SIZE = 12

let selectionGesture:
  | {
      pointerId: number
      kind: 'move' | 'resize' | 'curve' | 'rotate'
      start: Point
      original: RectangleShape
      initial: RectangleShape
      originalScene: SceneSnapshot
      handle?: ResizeHandle | Corner
      handleStart?: Point
      dragStarted?: boolean
    }
  | undefined

let lineSelectionGesture:
  | {
      pointerId: number
      kind: 'move' | LineEndpoint
      start: Point
      original: LineShape
      originalScene: SceneSnapshot
    }
  | undefined

const intervalWorld = computed(() => dotInterval(viewport.scale))
const spacing = computed(() => intervalWorld.value * viewport.scale)
const patternX = computed(() => positiveModulo(viewport.translationX, spacing.value))
const patternY = computed(() => positiveModulo(viewport.translationY, spacing.value))
const zoomLabel = computed(() => `${Math.round(viewport.scale * 100)}%`)
const cursorClass = computed(() => ({
  'is-pan-ready': isSpacePressed.value && !isPanning.value,
  'is-panning': isPanning.value,
  'is-drawing-shape': ['rectangle', 'ellipse', 'line'].includes(props.activeTool ?? ''),
  'is-text-ready': props.activeTool === 'text',
  'is-rotation-ready': hoveredSelectionHandle.value === 'rotate' && !isRotating.value,
  'is-rotating': isRotating.value,
  'is-curve-ready': Boolean(hoveredSelectionHandle.value && isCurveHandle(hoveredSelectionHandle.value)),
  'is-move-ready': isMoveReady.value,
  'is-resize-ns': resizeCursor(hoveredSelectionHandle.value) === 'ns',
  'is-resize-ew': resizeCursor(hoveredSelectionHandle.value) === 'ew',
  'is-resize-nwse': resizeCursor(hoveredSelectionHandle.value) === 'nwse',
  'is-resize-nesw': resizeCursor(hoveredSelectionHandle.value) === 'nesw',
}))
const selectedRectangle = computed(() =>
  rectangles.value.find((rectangle) => rectangle.id === selectedRectangleId.value),
)
const selectedLine = computed(() => lines.value.find((line) => line.id === selectedLineId.value))
const hasMultipleSelection = computed(() => selectedShapeIds.value.length > 1)
const selectionFrame = computed<RectangleShape | undefined>(() => {
  const rectangle = selectedRectangle.value
  if (!rectangle || hasMultipleSelection.value) return undefined
  // Keep handles clear of the shape stroke at every zoom level.
  const inset = 3 / viewport.scale
  return {
    ...rectangle,
    x: rectangle.x - inset,
    y: rectangle.y - inset,
    width: rectangle.width + inset * 2,
    height: rectangle.height + inset * 2,
    cornerRadius: 0,
  }
})
const selectionCorners = computed(() =>
  selectionFrame.value ? rectangleCorners(selectionFrame.value) : undefined,
)
const selectionEdges = computed(() => {
  const rectangle = selectionFrame.value
  if (!rectangle) return undefined
  const center = rectangleCenter(rectangle)
  return {
    north: rotatePoint({ x: center.x, y: rectangle.y }, center, rectangle.rotation),
    east: rotatePoint({ x: rectangle.x + rectangle.width, y: center.y }, center, rectangle.rotation),
    south: rotatePoint({ x: center.x, y: rectangle.y + rectangle.height }, center, rectangle.rotation),
    west: rotatePoint({ x: rectangle.x, y: center.y }, center, rectangle.rotation),
  } satisfies Record<Edge, Point>
})
const curveHandles = computed(() => {
  const rectangle = selectedRectangle.value
  if (!rectangle) return undefined
  const center = rectangleCenter(rectangle)
  const offset = Math.min(
    Math.max(rectangle.cornerRadius, 20 / viewport.scale),
    rectangle.width / 3,
    rectangle.height / 3,
  )
  return {
    northwest: rotatePoint({ x: rectangle.x + offset, y: rectangle.y + offset }, center, rectangle.rotation),
    northeast: rotatePoint({ x: rectangle.x + rectangle.width - offset, y: rectangle.y + offset }, center, rectangle.rotation),
    southeast: rotatePoint({ x: rectangle.x + rectangle.width - offset, y: rectangle.y + rectangle.height - offset }, center, rectangle.rotation),
    southwest: rotatePoint({ x: rectangle.x + offset, y: rectangle.y + rectangle.height - offset }, center, rectangle.rotation),
  } satisfies Record<Corner, Point>
})
const curveHandleRadius = computed(() => {
  const rectangle = selectedRectangle.value
  return rectangle ? Math.min(3 / viewport.scale, rectangle.width * 0.15, rectangle.height * 0.15) : 0
})
const visibleCurveHandles = computed((): Record<string, Point> | undefined => {
  const rectangle = selectedRectangle.value
  const handles = curveHandles.value
  if (!rectangle || !handles || Math.min(rectangle.width, rectangle.height) * viewport.scale >= 48) return handles
  return rectangle.width >= rectangle.height
    ? {
        northwest: midpoint(handles.northwest, handles.southwest),
        northeast: midpoint(handles.northeast, handles.southeast),
      }
    : {
        northwest: midpoint(handles.northwest, handles.northeast),
        southwest: midpoint(handles.southwest, handles.southeast),
      }
})
const showCurveControls = computed(() =>
  Boolean(selectedRectangle.value && !isEllipse(selectedRectangle.value) && !isText(selectedRectangle.value) && isHoveringSelectedShape.value),
)
const rotationHandle = computed(() => {
  const rectangle = selectionFrame.value
  if (!rectangle) return undefined
  const center = rectangleCenter(rectangle)
  return rotatePoint({ x: center.x, y: rectangle.y - 28 / viewport.scale }, center, rectangle.rotation)
})
const rotationStemStart = computed(() => {
  const rectangle = selectionFrame.value
  if (!rectangle) return undefined
  const center = rectangleCenter(rectangle)
  return rotatePoint({ x: center.x, y: rectangle.y }, center, rectangle.rotation)
})
const rotationHandleScreen = computed(() =>
  rotationHandle.value ? worldToScreen(rotationHandle.value, viewport) : undefined,
)
const isTextSelected = computed(() => Boolean(selectedRectangle.value && isText(selectedRectangle.value)))
const textLayouts = computed(() => new Map(rectangles.value.filter(isText).map((shape) => [
  shape.id, layoutText(shape.text, shape.width, shape.fontSize, shape.wrap),
])))
const textEditorStyle = computed(() => {
  const editor = textEditor.value
  if (!editor) return undefined
  const origin = editor.original
    ? rotatePoint({ x: editor.x, y: editor.y }, rectangleCenter(editor.original), editor.original.rotation)
    : { x: editor.x, y: editor.y }
  const point = worldToScreen(origin, viewport)
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    width: `${editor.width}px`,
    height: `${Math.max(editor.height, editor.fontSize * TEXT_LINE_HEIGHT)}px`,
    fontSize: `${editor.fontSize}px`,
    lineHeight: `${TEXT_LINE_HEIGHT}`,
    fontFamily: TEXT_FONT_FAMILY,
    transform: `scale(${viewport.scale}) rotate(${editor.original?.rotation ?? 0}deg)`,
    transformOrigin: 'top left',
  }
})
function applyViewport(next: Viewport) {
  if (![next.translationX, next.translationY, next.scale].every(Number.isFinite)) return
  Object.assign(viewport, next)
}

function queueViewport(next: Viewport, announce = false) {
  if (![next.translationX, next.translationY, next.scale].every(Number.isFinite)) {
    cancelGesture()
    return
  }

  pendingViewport = next
  pendingZoomAnnouncement ||= announce
  viewportFrame ??= window.requestAnimationFrame(flushViewport)
}

function flushViewport() {
  viewportFrame = undefined
  if (!pendingViewport) return

  applyViewport(pendingViewport)
  pendingViewport = undefined
  if (pendingZoomAnnouncement) announceZoom()
  pendingZoomAnnouncement = false
}

function copyViewport(viewport: Viewport): Viewport {
  return { ...viewport }
}

function latestViewport(): Viewport {
  return copyViewport(pendingViewport ?? viewport)
}

function center(): Point {
  return { x: size.x / 2, y: size.y / 2 }
}

function announceZoom() {
  window.clearTimeout(announceTimer)
  announceTimer = window.setTimeout(() => {
    liveMessage.value = `Zoom ${Math.round(viewport.scale * 1000) / 10}%`
  }, 180)
}

function setZoom(scale: number, point = center()) {
  queueViewport(zoomAt(latestViewport(), point, scale), true)
}

function stepZoom(direction: -1 | 1) {
  setZoom(nextZoomStep(latestViewport().scale, direction))
}

function resetZoom() {
  setZoom(1)
}

function copyScene(scene: SceneSnapshot = { rectangles: rectangles.value, lines: lines.value }): SceneSnapshot {
  return {
    rectangles: scene.rectangles.map((rectangle) => ({ ...rectangle })),
    lines: scene.lines.map((line) => ({ ...line, start: { ...line.start }, end: { ...line.end } })),
  }
}

function scenesMatch(left: SceneSnapshot, right: SceneSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function commitScene() {
  const next = copyScene()
  if (scenesMatch(history[historyIndex], next)) return
  history.splice(historyIndex + 1)
  history.push(next)
  historyIndex = history.length - 1
}

function restoreScene(index: number) {
  const scene = copyScene(history[index])
  rectangles.value = scene.rectangles
  lines.value = scene.lines
  selectedRectangleId.value = undefined
  selectedLineId.value = undefined
  selectedShapeIds.value = []
  hoveredSelectionHandle.value = undefined
  isHoveringSelectedShape.value = false
  isMoveReady.value = false
  clearSnapFeedback()
}

function undoScene() {
  cancelGesture()
  if (historyIndex === 0) return
  historyIndex -= 1
  restoreScene(historyIndex)
}

function redoScene() {
  cancelGesture()
  if (historyIndex === history.length - 1) return
  historyIndex += 1
  restoreScene(historyIndex)
}

function deleteSelectedShape(): boolean {
  if (!selectedShapeIds.value.length) return false
  rectangles.value = rectangles.value.filter((rectangle) => !selectedShapeIds.value.includes(rectangle.id))
  lines.value = lines.value.filter((line) => !selectedShapeIds.value.includes(line.id))
  clearSelection()
  commitScene()
  return true
}

function clearSelection() {
  selectedRectangleId.value = undefined
  selectedLineId.value = undefined
  selectedShapeIds.value = []
}

function selectShape(shape: RectangleShape | LineShape, append = false): boolean {
  const ids = shape.groupId
    ? [...rectangles.value, ...lines.value].filter((candidate) => candidate.groupId === shape.groupId).map((candidate) => candidate.id)
    : [shape.id]
  const wasSelected = ids.every((id) => selectedShapeIds.value.includes(id))
  selectedShapeIds.value = append
    ? wasSelected
      ? selectedShapeIds.value.filter((id) => !ids.includes(id))
      : [...new Set([...selectedShapeIds.value, ...ids])]
    : ids
  if (append && wasSelected) {
    const next = selectedShapeIds.value.at(-1)
    const rectangle = rectangles.value.find((candidate) => candidate.id === next)
    const line = lines.value.find((candidate) => candidate.id === next)
    selectedRectangleId.value = rectangle?.id
    selectedLineId.value = line?.id
    return false
  }
  if ('kind' in shape && shape.kind === 'line') {
    selectedRectangleId.value = undefined
    selectedLineId.value = shape.id
  } else {
    selectedRectangleId.value = shape.id
    selectedLineId.value = undefined
  }
  return true
}

function groupSelectedShapes(): boolean {
  if (selectedShapeIds.value.length < 2) return false
  const groupId = nextGroupId()
  rectangles.value = rectangles.value.map((shape) =>
    selectedShapeIds.value.includes(shape.id) ? { ...shape, groupId } : shape,
  )
  lines.value = lines.value.map((shape) =>
    selectedShapeIds.value.includes(shape.id) ? { ...shape, groupId } : shape,
  )
  commitScene()
  return true
}

function copySelectedShape(): boolean {
  clipboard = selectedRectangle.value ? { ...selectedRectangle.value } : selectedLine.value && copyLine(selectedLine.value)
  return Boolean(clipboard)
}

function pasteShape(): boolean {
  if (!clipboard) return false
  if ('kind' in clipboard && clipboard.kind === 'line') {
    const line = {
      ...copyLine(clipboard),
      id: nextId('line'),
      start: { x: clipboard.start.x + 10, y: clipboard.start.y + 10 },
      end: { x: clipboard.end.x + 10, y: clipboard.end.y + 10 },
    }
    lines.value.push(line)
    selectShape(line)
  } else {
    const rectangle = {
      ...clipboard,
      id: nextId(isText(clipboard) ? 'text' : isEllipse(clipboard) ? 'ellipse' : 'rectangle'),
      x: clipboard.x + 10,
      y: clipboard.y + 10,
    }
    rectangles.value.push(rectangle)
    selectShape(rectangle)
  }
  commitScene()
  return true
}

function moveSelectedShape(x: number, y: number): boolean {
  if (!selectedShapeIds.value.length) return false
  moveSelectedShapes(copyScene(), { x, y })
  commitScene()
  return true
}

function moveSelectedShapes(scene: SceneSnapshot, delta: Point) {
  rectangles.value = rectangles.value.map((shape) => {
    const original = scene.rectangles.find((candidate) => candidate.id === shape.id)
    return original && selectedShapeIds.value.includes(shape.id) ? moveRectangle(original, delta) : shape
  })
  lines.value = lines.value.map((shape) => {
    const original = scene.lines.find((candidate) => candidate.id === shape.id)
    return original && selectedShapeIds.value.includes(shape.id) ? moveLine(original, delta) : shape
  })
}

function localPoint(event: MouseEvent | WheelEvent): Point {
  const bounds = root.value?.getBoundingClientRect()
  return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) }
}

function autoPan(point: Point) {
  const x = edgePanDelta(point.x, size.x)
  const y = edgePanDelta(point.y, size.y)
  if (x === 0 && y === 0) return
  const current = latestViewport()
  queueViewport({ ...current, translationX: current.translationX + x, translationY: current.translationY + y })
}

function edgePanDelta(value: number, maximum: number): number {
  if (value < AUTO_PAN_EDGE) return Math.min(AUTO_PAN_SPEED, AUTO_PAN_EDGE - value)
  if (value > maximum - AUTO_PAN_EDGE) return -Math.min(AUTO_PAN_SPEED, value - (maximum - AUTO_PAN_EDGE))
  return 0
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function centroid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function beginPinch() {
  const [a, b] = [...pointers.values()]
  if (!a || !b) return
  const nextDistance = distance(a, b)
  if (nextDistance <= 0) return
  singlePointerStart = undefined
  isPanning.value = true
  pinchStart = {
    distance: nextDistance,
    centroid: centroid(a, b),
    viewport: latestViewport(),
  }
}

function startTextEditor(editor: TextEditor) {
  clearSelection()
  hoveredSelectionHandle.value = undefined
  isMoveReady.value = false
  textEditor.value = editor
  nextTick(() => {
    textArea.value?.focus({ preventScroll: true })
    if (editor.shapeId && textArea.value) {
      textArea.value.select()
      textArea.value.scrollLeft = 0
      textArea.value.scrollTop = 0
    }
    if (!editor.shapeId) keepTextEditorVisible()
  })
}

function beginText(event: PointerEvent, point: Point) {
  if (textGesture) return
  const start = screenToWorld(point, latestViewport())
  const hit = [...rectangles.value].reverse().find((shape) => containsPoint(shape, start))
  if (hit) {
    isText(hit) ? editText(hit) : editLabel(hit)
    emit('cancelTool')
    event.preventDefault()
    return
  }
  clearSelection()
  textGesture = { pointerId: event.pointerId, start }
  root.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function updateText(event: PointerEvent) {
  if (!textGesture) return
  const end = screenToWorld(localPoint(event), latestViewport())
  textGesture.end = end
  if (distance(textGesture.start, end) * latestViewport().scale < 4) {
    pendingText.value = undefined
    return
  }
  const draft = rectangleFromPoints(textGesture.start, end, 'pending-text')
  pendingText.value = { ...draft, width: Math.max(24, draft.width), height: 20 }
}

function finishText(event: PointerEvent) {
  if (!textGesture || textGesture.pointerId !== event.pointerId) return false
  const start = textGesture.start
  if (event.type === 'pointerup') updateText(event)
  const end = textGesture.end ?? start
  const dragged = distance(start, end) * latestViewport().scale >= 4
  const draft = pendingText.value
  startTextEditor({
    kind: 'text',
    text: '',
    x: dragged ? draft?.x ?? start.x : start.x,
    y: dragged ? draft?.y ?? start.y : start.y - 10,
    width: dragged ? Math.max(24, draft?.width ?? Math.abs(end.x - start.x)) : 16,
    height: 20,
    fontSize: 16,
    wrap: dragged,
  })
  pendingText.value = undefined
  textGesture = undefined
  releasePointer(event.pointerId)
  emit('cancelTool')
  return true
}

function editText(shape: TextShape) {
  startTextEditor({
    kind: 'text',
    shapeId: shape.id,
    text: shape.text,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    fontSize: shape.fontSize,
    wrap: shape.wrap,
    original: { ...shape },
  })
}

function editLabel(shape: RectangleShape) {
  const fitted = fitLabel(shape, shape.label ?? '')
  startTextEditor({
    kind: 'label',
    shapeId: shape.id,
    text: shape.label ?? '',
    x: labelTextX(fitted.shape),
    y: fitted.shape.y + (fitted.shape.height - fitted.layout.height) / 2,
    width: labelTextWidth(fitted.shape),
    height: fitted.layout.height,
    fontSize: shape.labelFontSize ?? 16,
    wrap: true,
    original: { ...shape },
  })
}

function updateTextEditor(event: Event) {
  const editor = textEditor.value
  const input = event.target as HTMLTextAreaElement
  if (!editor) return
  editor.text = input.value
  if (editor.kind === 'label' && editor.shapeId) {
    const shape = rectangles.value.find((candidate) => candidate.id === editor.shapeId)
    if (!shape || isText(shape)) return
    const fitted = fitLabel(shape, editor.text)
    replaceRectangle({ ...fitted.shape, label: editor.text || undefined, labelFontSize: shape.labelFontSize ?? 16 })
    editor.x = labelTextX(fitted.shape)
    editor.y = fitted.shape.y + (fitted.shape.height - fitted.layout.height) / 2
    editor.width = labelTextWidth(fitted.shape)
    editor.height = fitted.layout.height
    return
  }
  const layout = layoutText(editor.text, editor.width, editor.fontSize, editor.wrap)
  editor.width = editor.wrap ? editor.width : layout.width
  editor.height = layout.height
  nextTick(keepTextEditorVisible)
}

function keepTextEditorVisible() {
  const input = textArea.value
  const bounds = root.value?.getBoundingClientRect()
  if (!input || !bounds) return
  const editor = input.getBoundingClientRect()
  const translationX = editor.width > bounds.width - TEXT_VIEWPORT_INSET * 2
    ? bounds.right - TEXT_VIEWPORT_INSET - editor.right
    : Math.min(0, bounds.right - TEXT_VIEWPORT_INSET - editor.right)
      || Math.max(0, bounds.left + TEXT_VIEWPORT_INSET - editor.left)
  const translationY = Math.min(0, bounds.bottom - TEXT_VIEWPORT_INSET - editor.bottom)
    || Math.max(0, bounds.top + TEXT_VIEWPORT_INSET - editor.top)
  if (translationX || translationY) {
    const viewport = latestViewport()
    queueViewport({ ...viewport, translationX: viewport.translationX + translationX, translationY: viewport.translationY + translationY })
  }
}

function finishTextEditor() {
  const editor = textEditor.value
  if (!editor) return
  textEditor.value = undefined
  if (props.activeTool === 'text') emit('cancelTool')
  if (!editor.text.trim()) {
    if (editor.kind === 'label' && editor.shapeId) {
      updateLabel(editor.shapeId, undefined)
      return
    }
    if (editor.shapeId) {
      rectangles.value = rectangles.value.filter((shape) => shape.id !== editor.shapeId)
      clearSelection()
      commitScene()
    }
    return
  }
  if (editor.kind === 'label' && editor.shapeId) {
    updateLabel(editor.shapeId, editor.text)
    return
  }
  const layout = layoutText(editor.text, editor.width, editor.fontSize, editor.wrap)
  const shape: TextShape = {
    ...fitTextBounds(editor.original ?? {
      id: '', x: editor.x, y: editor.y, width: editor.width, height: editor.height,
      rotation: 0, cornerRadius: 0,
    }, layout.width, layout.height),
    id: editor.shapeId ?? nextId('text'),
    kind: 'text',
    text: editor.text,
    fontSize: editor.fontSize,
    wrap: editor.wrap,
    rotation: editor.original?.rotation ?? 0,
    cornerRadius: editor.original?.cornerRadius ?? 0,
  }
  if (editor.shapeId) replaceRectangle(shape)
  else rectangles.value.push(shape)
  selectShape(shape)
  commitScene()
}

function updateLabel(id: string, label: string | undefined) {
  const shape = rectangles.value.find((candidate) => candidate.id === id)
  if (!shape || isText(shape)) return
  replaceRectangle({ ...fitLabel(shape, label ?? '').shape, label, labelFontSize: shape.labelFontSize ?? 16 })
  selectShape(shape)
  commitScene()
}

function beginRectangle(event: PointerEvent, point: Point) {
  const start = screenToWorld(point, latestViewport())
  rectangleGesture = { pointerId: event.pointerId, start }
  latestGesturePoint.value = point
  pendingRectangle.value = shapeFromPoints(start, start, 'pending')
  root.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function updateRectangle(point: Point) {
  if (!rectangleGesture) return
  pendingRectangle.value = shapeFromPoints(
    rectangleGesture.start,
    screenToWorld(point, latestViewport()),
    'pending', isShiftPressed.value,
  )
}

function finishRectangle(event: PointerEvent) {
  if (!rectangleGesture || rectangleGesture.pointerId !== event.pointerId) return false
  const rectangle = pendingRectangle.value
  if (rectangle && rectangle.width > 0 && rectangle.height > 0) {
    const isEllipseShape = isEllipse(rectangle)
    const committed = {
      ...rectangle,
      id: nextId(isEllipseShape ? 'ellipse' : 'rectangle'),
    }
    rectangles.value.push(committed)
    selectShape(committed)
    commitScene()
    if (isEllipseShape) emit('ellipseCreated')
    else emit('rectangleCreated')
  }
  pendingRectangle.value = undefined
  rectangleGesture = undefined
  latestGesturePoint.value = undefined
  releasePointer(event.pointerId)
  return true
}

function beginLine(event: PointerEvent, point: Point) {
  const start = screenToWorld(point, latestViewport())
  lineGesture = { pointerId: event.pointerId, start }
  latestGesturePoint.value = point
  pendingLine.value = lineFromPoints(start, start, 'pending')
  root.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function updateLine(point: Point) {
  if (!lineGesture) return
  pendingLine.value = lineFromPoints(
    lineGesture.start,
    screenToWorld(point, latestViewport()),
    'pending',
    isShiftPressed.value,
  )
}

function finishLine(event: PointerEvent) {
  if (!lineGesture || lineGesture.pointerId !== event.pointerId) return false
  const line = pendingLine.value
  if (line && distance(line.start, line.end) > 0) {
    const committed = { ...line, id: nextId('line') }
    lines.value.push(committed)
    selectShape(committed)
    commitScene()
    emit('lineCreated')
  }
  pendingLine.value = undefined
  lineGesture = undefined
  latestGesturePoint.value = undefined
  clearSnapFeedback()
  releasePointer(event.pointerId)
  return true
}

function startSelection(event: PointerEvent, point: Point) {
  clearSnapFeedback()
  isMoveReady.value = false
  latestGesturePoint.value = point
  const worldPoint = screenToWorld(point, latestViewport())
  const handle = hasMultipleSelection.value ? undefined : selectionHandleAt(point)
  const rectangle = selectedRectangle.value
  const line = selectedLine.value
  const lineHandle = hasMultipleSelection.value ? undefined : lineSelectionHandleAt(point)
  if (event.shiftKey && !handle && !lineHandle) {
    const hit = [...rectangles.value].reverse().find((candidate) => containsPoint(candidate, worldPoint))
    if (hit) selectShape(hit, true)
    else {
      const lineHit = [...lines.value].reverse().find((candidate) => containsLine(candidate, point))
      if (lineHit) selectShape(lineHit, true)
    }
    return
  }
  if (line && lineHandle) {
    lineSelectionGesture = {
      pointerId: event.pointerId,
      kind: lineHandle,
      start: worldPoint,
      original: copyLine(line),
      originalScene: copyScene(),
    }
  } else if (rectangle && handle) {
    hoveredSelectionHandle.value = handle
    selectionGesture = {
      pointerId: event.pointerId,
      kind: handle === 'rotate' ? 'rotate' : isCurveHandle(handle) ? 'curve' : 'resize',
      handle: handle === 'rotate' ? undefined : isCurveHandle(handle) ? curveCorner(handle) : handle,
      start: worldPoint,
      original: { ...rectangle },
      initial: { ...rectangle },
      originalScene: copyScene(),
      handleStart: handle === 'rotate' || isCurveHandle(handle) ? undefined : resizeHandlePoint(rectangle, handle),
    }
    isRotating.value = handle === 'rotate'
  } else {
    const hit = [...rectangles.value].reverse().find((candidate) => containsPoint(candidate, worldPoint))
    isHoveringSelectedShape.value = Boolean(hit)
    if (hit) {
      if (!selectShape(hit, event.shiftKey)) return
      selectionGesture = {
        pointerId: event.pointerId,
        kind: 'move',
        start: worldPoint,
        original: { ...hit },
        initial: { ...hit },
        originalScene: copyScene(),
      }
    } else {
      const lineHit = [...lines.value].reverse().find((candidate) => containsLine(candidate, point))
      if (lineHit) {
        if (!selectShape(lineHit, event.shiftKey)) return
        lineSelectionGesture = {
          pointerId: event.pointerId,
          kind: 'move',
          start: worldPoint,
          original: copyLine(lineHit),
          originalScene: copyScene(),
        }
      } else if (!event.shiftKey) {
        clearSelection()
      }
    }
  }

  if (!selectionGesture && !lineSelectionGesture) return
  root.value?.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function updateSelection(point: Point, constrainProportions = isShiftPressed.value) {
  if (lineSelectionGesture) {
    updateLineSelection(point)
    return
  }
  if (!selectionGesture) return
  const pointer = screenToWorld(point, latestViewport())
  const { original } = selectionGesture
  if (isText(original) && !selectionGesture.dragStarted) {
    if (distance(pointer, selectionGesture.start) * latestViewport().scale < TEXT_DRAG_THRESHOLD) return
    selectionGesture.dragStarted = true
    selectionGesture.start = pointer
    return
  }
  const textCornerResize = Boolean(
    isText(original) && selectionGesture.kind === 'resize' && selectionGesture.handle && isCorner(selectionGesture.handle),
  )
  const moved = moveRectangle(original, {
    x: pointer.x - selectionGesture.start.x,
    y: pointer.y - selectionGesture.start.y,
  })
  const moveSnap = selectionGesture.kind === 'move'
    ? snapShapeMove(moved, rectangles.value, viewport.scale)
    : undefined
  const resizeSnap = selectionGesture.kind === 'resize' && selectionGesture.handle && !constrainProportions && !textCornerResize
    ? snapResizeHandlePoint(
        resizePointer(pointer),
        original,
        selectionGesture.handle,
        rectangles.value,
        viewport.scale,
      )
    : undefined
  if (moveSnap) {
    alignmentGuides.value = moveSnap.alignmentGuides
    spacingMarkers.value = moveSnap.spacingMarkers
  } else if (resizeSnap) {
    alignmentGuides.value = resizeSnap.alignmentGuides
    spacingMarkers.value = []
  } else {
    clearShapeSnapFeedback()
  }
  const next =
    selectionGesture.kind === 'move'
      ? moveSnap!.shape
      : selectionGesture.kind === 'resize' && selectionGesture.handle
        ? isCorner(selectionGesture.handle)
          ? resizeFromCorner(
              original,
              selectionGesture.handle,
              resizeSnap?.point ?? resizePointer(pointer),
              constrainProportions || textCornerResize,
            )
          : resizeFromEdge(
              original,
              selectionGesture.handle,
              resizeSnap?.point ?? resizePointer(pointer),
              constrainProportions,
            )
        : selectionGesture.kind === 'curve' && selectionGesture.handle && isCorner(selectionGesture.handle)
          ? setCornerRadius(
              original,
              selectionGesture.handle,
              curvePointer(original, selectionGesture.handle, pointer, selectionGesture.start),
            )
        : rotateRectangle(original, selectionGesture.start, pointer, constrainProportions)
  if (selectionGesture.kind === 'move') {
    moveSelectedShapes(selectionGesture.originalScene, {
      x: next.x - original.x,
      y: next.y - original.y,
    })
    return
  }
  if (isText(original)) {
    replaceRectangle(selectionGesture.kind === 'resize' ? resizeText(original, next, textCornerResize) : next)
  } else replaceRectangle(resizeLabel(original, next))
}

function updateLineSelection(point: Point) {
  if (!lineSelectionGesture) return
  const pointer = screenToWorld(point, latestViewport())
  const { original } = lineSelectionGesture
  const { kind } = lineSelectionGesture
  if (kind === 'move') {
    clearSnapFeedback()
    const moved = moveLine(original, {
      x: pointer.x - lineSelectionGesture.start.x,
      y: pointer.y - lineSelectionGesture.start.y,
    })
    moveSelectedShapes(lineSelectionGesture.originalScene, {
      x: moved.start.x - original.start.x,
      y: moved.start.y - original.start.y,
    })
    return
  }

  replaceLine(rotateLineEndpoint(original, kind, pointer, isShiftPressed.value))
}

function finishSelection(event: PointerEvent, restore = false): boolean {
  if (lineSelectionGesture?.pointerId === event.pointerId) {
    if (restore) replaceLine(lineSelectionGesture.original)
    lineSelectionGesture = undefined
    latestGesturePoint.value = undefined
    clearSnapFeedback()
    releasePointer(event.pointerId)
    if (!restore) commitScene()
    return true
  }
  if (!selectionGesture || selectionGesture.pointerId !== event.pointerId) return false
  if (restore) replaceRectangle(selectionGesture.initial)
  selectionGesture = undefined
  latestGesturePoint.value = undefined
  isRotating.value = false
  clearSnapFeedback()
  releasePointer(event.pointerId)
  if (!restore) commitScene()
  return true
}

function selectionHandleAt(point: Point): SelectionHandle | undefined {
  if (rotationHandle.value && distance(point, worldToScreen(rotationHandle.value, latestViewport())) <= HANDLE_HIT_RADIUS) {
    return 'rotate'
  }
  if (showCurveControls.value && visibleCurveHandles.value) {
    const curve = (Object.entries(visibleCurveHandles.value) as [Corner, Point][]).find(([, curvePoint]) =>
      distance(point, worldToScreen(curvePoint, latestViewport())) <= HANDLE_HIT_RADIUS,
    )?.[0]
    if (curve) return `curve-${curve}`
  }
  if (!selectionCorners.value) return undefined
  const frame = selectionFrame.value
  const cornerRadius = isTextSelected.value && frame
    ? Math.min(8, frame.height * viewport.scale / 4, frame.width * viewport.scale / 4)
    : HANDLE_HIT_RADIUS
  const corner = (Object.entries(selectionCorners.value) as [Corner, Point][]).find(([, cornerPoint]) =>
    distance(point, worldToScreen(cornerPoint, latestViewport())) <= cornerRadius,
  )?.[0]
  if (corner) return corner
  return edgeAtPoint(point, HANDLE_HIT_RADIUS)
}

function replaceRectangle(next: RectangleShape) {
  const index = rectangles.value.findIndex((rectangle) => rectangle.id === next.id)
  if (index >= 0) rectangles.value.splice(index, 1, next)
}

function replaceLine(next: LineShape) {
  const index = lines.value.findIndex((line) => line.id === next.id)
  if (index >= 0) lines.value.splice(index, 1, next)
}

function clearShapeSnapFeedback() {
  alignmentGuides.value = []
  spacingMarkers.value = []
}

function clearSnapFeedback() {
  clearShapeSnapFeedback()
}

function updateSelectionHover(point: Point) {
  const worldPoint = screenToWorld(point, latestViewport())
  isHoveringSelectedShape.value = Boolean(
    selectedRectangle.value && containsPoint(selectedRectangle.value, worldPoint),
  )
  const handle = selectionHandleAt(point)
  hoveredSelectionHandle.value = handle
  if (handle) {
    isMoveReady.value = false
    return
  }
  isMoveReady.value =
    rectangles.value.some((rectangle) => containsPoint(rectangle, worldPoint)) ||
    lines.value.some((line) => containsLine(line, point))
}

function lineSelectionHandleAt(point: Point): LineEndpoint | undefined {
  const line = selectedLine.value
  if (!line) return undefined
  if (distance(point, worldToScreen(line.start, latestViewport())) <= HANDLE_HIT_RADIUS) return 'start'
  if (distance(point, worldToScreen(line.end, latestViewport())) <= HANDLE_HIT_RADIUS) return 'end'
  return undefined
}

function resizePointer(pointer: Point): Point {
  if (!selectionGesture?.handleStart) return pointer
  return {
    x: selectionGesture.handleStart.x + pointer.x - selectionGesture.start.x,
    y: selectionGesture.handleStart.y + pointer.y - selectionGesture.start.y,
  }
}

function curvePointer(rectangle: RectangleShape, corner: Corner, pointer: Point, start: Point): Point {
  const radius = rectangle.cornerRadius
  const center = rectangleCenter(rectangle)
  const x = corner === 'northwest' || corner === 'southwest' ? rectangle.x + radius : rectangle.x + rectangle.width - radius
  const y = corner === 'northwest' || corner === 'northeast' ? rectangle.y + radius : rectangle.y + rectangle.height - radius
  const origin = rotatePoint({ x, y }, center, rectangle.rotation)
  return { x: origin.x + pointer.x - start.x, y: origin.y + pointer.y - start.y }
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function refreshActiveGesture() {
  if (!latestGesturePoint.value) return
  if (rectangleGesture) updateRectangle(latestGesturePoint.value)
  else if (lineGesture) updateLine(latestGesturePoint.value)
  else if (selectionGesture || lineSelectionGesture) updateSelection(latestGesturePoint.value)
}

function rebaseProportionalResize() {
  const gesture = selectionGesture
  if (!gesture || gesture.kind !== 'resize' || !gesture.handle || !latestGesturePoint.value) return
  const current = rectangles.value.find((shape) => shape.id === gesture.original.id)
  if (!current) return
  const pointer = screenToWorld(latestGesturePoint.value, latestViewport())
  selectionGesture = {
    ...gesture,
    start: pointer,
    original: { ...current },
    handleStart: resizeHandlePoint(current, gesture.handle),
  }
}

function resizeHandlePoint(rectangle: RectangleShape, handle: ResizeHandle): Point {
  const corners = rectangleCorners(rectangle)
  if (isCorner(handle)) return corners[handle]
  const center = rectangleCenter(rectangle)
  const points: Record<Edge, Point> = {
    north: rotatePoint({ x: center.x, y: rectangle.y }, center, rectangle.rotation),
    east: rotatePoint({ x: rectangle.x + rectangle.width, y: center.y }, center, rectangle.rotation),
    south: rotatePoint({ x: center.x, y: rectangle.y + rectangle.height }, center, rectangle.rotation),
    west: rotatePoint({ x: rectangle.x, y: center.y }, center, rectangle.rotation),
  }
  return points[handle]
}

function edgeAtPoint(point: Point, hitRadius: number): Edge | undefined {
  if (!selectionCorners.value) return undefined
  const corners = selectionCorners.value
  const edges: Partial<Record<Edge, [Point, Point]>> = {
    north: [corners.northwest, corners.northeast],
    east: [corners.northeast, corners.southeast],
    south: [corners.southwest, corners.southeast],
    west: [corners.northwest, corners.southwest],
  }
  if (isTextSelected.value) {
    delete edges.north
    delete edges.south
  }
  return (Object.entries(edges) as [Edge, [Point, Point]][]).find(([, [start, end]]) =>
    distanceToSegment(point, worldToScreen(start, latestViewport()), worldToScreen(end, latestViewport())) <= hitRadius,
  )?.[0]
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const delta = { x: end.x - start.x, y: end.y - start.y }
  const lengthSquared = delta.x ** 2 + delta.y ** 2
  if (lengthSquared === 0) return distance(point, start)
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y) / lengthSquared),
  )
  return distance(point, { x: start.x + delta.x * projection, y: start.y + delta.y * projection })
}

function containsLine(line: LineShape, point: Point): boolean {
  return distanceToSegment(
    point,
    worldToScreen(line.start, latestViewport()),
    worldToScreen(line.end, latestViewport()),
  ) <= LINE_HIT_RADIUS
}

function copyLine(line: LineShape): LineShape {
  return { ...line, start: { ...line.start }, end: { ...line.end } }
}

function nextId(kind: string): string {
  return `${kind}-${rectangles.value.length + lines.value.length}`
}

function nextGroupId(): string {
  let index = 0
  const groups = new Set([...rectangles.value, ...lines.value].map((shape) => shape.groupId))
  while (groups.has(`group-${index}`)) index += 1
  return `group-${index}`
}

function releasePointer(pointerId: number) {
  if (root.value?.hasPointerCapture(pointerId)) root.value.releasePointerCapture(pointerId)
}

function isCorner(handle: ResizeHandle): handle is Corner {
  return handle === 'northwest' || handle === 'northeast' || handle === 'southeast' || handle === 'southwest'
}

function curveCorner(handle: CurveHandle): Corner {
  return handle.slice('curve-'.length) as Corner
}

function isCurveHandle(handle: SelectionHandle): handle is CurveHandle {
  return handle.startsWith('curve-')
}

function isEllipse(shape: RectangleShape): boolean {
  return 'kind' in shape && shape.kind === 'ellipse'
}

function isText(shape: RectangleShape): shape is TextShape {
  return 'kind' in shape && shape.kind === 'text'
}

function resizeText(original: TextShape, next: RectangleShape, scaleFont: boolean): TextShape {
  const scale = Math.max(8 / original.fontSize, next.width / original.width)
  const fontSize = scaleFont ? original.fontSize * scale : original.fontSize
  const width = scaleFont ? original.width * scale : Math.max(24, next.width)
  const wrap = !scaleFont || original.wrap
  const layout = layoutText(original.text, width, fontSize, wrap)
  const handle = selectionGesture?.handle
  const anchor = {
    x: handle === 'west' || handle === 'northwest' || handle === 'southwest' ? 1 : 0,
    y: handle === 'northwest' || handle === 'northeast' ? 1 : 0,
  }
  const bounds = fitTextBounds(next, layout.width, layout.height, anchor)
  return { ...original, ...bounds, fontSize, wrap }
}

function fitTextBounds(shape: RectangleShape, width: number, height: number, anchor: Point = { x: 0, y: 0 }): RectangleShape {
  // Preserve the editing origin or fixed resize anchor when rotated text reflows.
  const center = rotatePoint(
    {
      x: shape.x + shape.width * anchor.x + width * (0.5 - anchor.x),
      y: shape.y + shape.height * anchor.y + height * (0.5 - anchor.y),
    },
    rectangleCenter(shape), shape.rotation,
  )
  return { ...shape, x: center.x - width / 2, y: center.y - height / 2, width, height }
}

function resizeLabel(original: RectangleShape, next: RectangleShape): RectangleShape {
  if (!original.label) return next
  const scale = Math.min(next.width / original.width, next.height / original.height)
  return { ...next, labelFontSize: Math.max(MIN_LABEL_FONT_SIZE, (original.labelFontSize ?? 16) * scale) }
}

function labelTextWidth(shape: RectangleShape): number {
  const width = isEllipse(shape) ? shape.width / Math.SQRT2 : shape.width
  return Math.max(1, width - LABEL_PADDING * 2)
}

function labelTextX(shape: RectangleShape): number {
  return shape.x + (shape.width - labelTextWidth(shape)) / 2
}

function labelLayout(shape: RectangleShape, text: string) {
  return layoutText(text, labelTextWidth(shape), shape.labelFontSize ?? 16, true)
}

function fitLabel(shape: RectangleShape, text: string) {
  const layout = labelLayout(shape, text)
  const scale = isEllipse(shape) ? Math.max(1, (layout.height + LABEL_PADDING * 2) * Math.SQRT2 / shape.height) : 1
  const width = shape.width * scale
  const height = isEllipse(shape) ? shape.height * scale : Math.max(shape.height, layout.height + LABEL_PADDING * 2)
  return {
    shape: {
      ...shape,
      x: shape.x - (width - shape.width) / 2,
      y: shape.y - (height - shape.height) / 2,
      width,
      height,
    },
    layout,
  }
}

function wrapText(text: string, width: number, fontSize: number, wrap = true): string[] {
  return layoutText(text, width, fontSize, wrap).lines
}

function shapeFromPoints(start: Point, end: Point, id: string, constrainProportions = false): RectangleShape {
  return props.activeTool === 'ellipse'
    ? ellipseFromPoints(start, end, id, constrainProportions)
    : rectangleFromPoints(start, end, id, constrainProportions)
}

function resizeCursor(handle: SelectionHandle | undefined): 'ns' | 'ew' | 'nwse' | 'nesw' | undefined {
  if (!handle || handle === 'rotate' || isCurveHandle(handle)) return undefined
  const rotation = selectedRectangle.value?.rotation ?? 0
  if (handle === 'north' || handle === 'south') return cursorForAngle(rotation + 90)
  if (handle === 'east' || handle === 'west') return cursorForAngle(rotation)
  return cursorForAngle(rotation + (handle === 'northwest' || handle === 'southeast' ? 45 : 135))
}

function cursorForAngle(angle: number): 'ns' | 'ew' | 'nwse' | 'nesw' {
  const directions = ['ew', 'nwse', 'ns', 'nesw'] as const
  const normalized = ((angle % 180) + 180) % 180
  return directions[Math.round(normalized / 45) % directions.length]
}

function onPointerDown(event: PointerEvent) {
  if (editableTarget(event.target) || (event.target as Element).closest('button')) return
  root.value?.focus({ preventScroll: true })
  isShiftPressed.value = event.shiftKey
  if (event.button === 2) return
  if (textEditor.value) {
    finishTextEditor()
  }

  const point = localPoint(event)
  if ((props.activeTool === 'rectangle' || props.activeTool === 'ellipse') && event.button === 0 && !isSpacePressed.value) {
    beginRectangle(event, point)
    return
  }
  if (props.activeTool === 'line' && event.button === 0 && !isSpacePressed.value) {
    beginLine(event, point)
    return
  }
  if (props.activeTool === 'text' && event.button === 0 && !isSpacePressed.value) {
    beginText(event, point)
    return
  }
  if (props.activeTool === 'select' && event.button === 0 && !isSpacePressed.value) {
    startSelection(event, point)
    return
  }

  const isTouch = event.pointerType === 'touch'
  const isPen = event.pointerType === 'pen'
  const isMiddleButton = event.button === 1
  const isSpacePan = event.button === 0 && isSpacePressed.value
  const canTrack = isTouch || isPen || isMiddleButton || isSpacePan
  if (!canTrack || awaitingTouchRelease.value) return

  pointers.set(event.pointerId, { ...point, pointerType: event.pointerType })
  root.value?.setPointerCapture(event.pointerId)
  event.preventDefault()

  if (pointers.size === 2) {
    beginPinch()
    return
  }

  if (pointers.size === 1) {
    if (isTouch || isMiddleButton || isSpacePan) {
      singlePointerStart = { point, viewport: latestViewport() }
      isPanning.value = true
    }
  }
}

function onPointerMove(event: PointerEvent) {
  if (textGesture?.pointerId === event.pointerId) {
    autoPan(localPoint(event))
    updateText(event)
    event.preventDefault()
    return
  }
  if (rectangleGesture?.pointerId === event.pointerId) {
    isShiftPressed.value = event.shiftKey
    latestGesturePoint.value = localPoint(event)
    autoPan(latestGesturePoint.value)
    updateRectangle(latestGesturePoint.value)
    event.preventDefault()
    return
  }
  if (lineGesture?.pointerId === event.pointerId) {
    isShiftPressed.value = event.shiftKey
    latestGesturePoint.value = localPoint(event)
    autoPan(latestGesturePoint.value)
    updateLine(latestGesturePoint.value)
    event.preventDefault()
    return
  }
  if (selectionGesture?.pointerId === event.pointerId) {
    isShiftPressed.value = event.shiftKey
    latestGesturePoint.value = localPoint(event)
    autoPan(latestGesturePoint.value)
    updateSelection(latestGesturePoint.value)
    event.preventDefault()
    return
  }
  if (lineSelectionGesture?.pointerId === event.pointerId) {
    isShiftPressed.value = event.shiftKey
    latestGesturePoint.value = localPoint(event)
    autoPan(latestGesturePoint.value)
    updateSelection(latestGesturePoint.value)
    event.preventDefault()
    return
  }
  if (props.activeTool === 'select') {
    updateSelectionHover(localPoint(event))
  }
  if (!pointers.has(event.pointerId)) return
  const point = localPoint(event)
  const previous = pointers.get(event.pointerId)!
  pointers.set(event.pointerId, { ...point, pointerType: previous.pointerType })
  event.preventDefault()

  if (pointers.size >= 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    if (!a || !b) return
    const currentCentroid = centroid(a, b)
    const nextScale = pinchStart.viewport.scale * (distance(a, b) / pinchStart.distance)
    const zoomed = zoomAt(pinchStart.viewport, pinchStart.centroid, nextScale)
    queueViewport(
      {
        ...zoomed,
        translationX: zoomed.translationX + currentCentroid.x - pinchStart.centroid.x,
        translationY: zoomed.translationY + currentCentroid.y - pinchStart.centroid.y,
      },
      true,
    )
    return
  }

  if (singlePointerStart) {
    queueViewport({
      ...singlePointerStart.viewport,
      translationX: singlePointerStart.viewport.translationX + point.x - singlePointerStart.point.x,
      translationY: singlePointerStart.viewport.translationY + point.y - singlePointerStart.point.y,
    })
  }
}

function finishPointer(event: PointerEvent) {
  if (finishText(event)) return
  if (finishRectangle(event)) return
  if (finishLine(event)) return
  if (finishSelection(event)) return
  if (!pointers.has(event.pointerId)) return
  const wasPinching = pointers.size >= 2 || Boolean(pinchStart)
  pointers.delete(event.pointerId)
  releasePointer(event.pointerId)
  singlePointerStart = undefined
  pinchStart = undefined

  if (wasPinching && pointers.size > 0) awaitingTouchRelease.value = true
  if (pointers.size === 0) {
    awaitingTouchRelease.value = false
    isPanning.value = false
  }
}

function cancelPointer(event: PointerEvent) {
  if (textGesture?.pointerId === event.pointerId) {
    textGesture = undefined
    pendingText.value = undefined
    releasePointer(event.pointerId)
    return
  }
  if (rectangleGesture?.pointerId === event.pointerId) {
    pendingRectangle.value = undefined
    rectangleGesture = undefined
    latestGesturePoint.value = undefined
    releasePointer(event.pointerId)
    return
  }
  if (lineGesture?.pointerId === event.pointerId) {
    pendingLine.value = undefined
    lineGesture = undefined
    latestGesturePoint.value = undefined
    clearSnapFeedback()
    releasePointer(event.pointerId)
    return
  }
  if (finishSelection(event, true)) return
  finishPointer(event)
}

function cancelGesture() {
  for (const id of pointers.keys()) {
    releasePointer(id)
  }
  if (rectangleGesture) releasePointer(rectangleGesture.pointerId)
  if (lineGesture) releasePointer(lineGesture.pointerId)
  if (selectionGesture) releasePointer(selectionGesture.pointerId)
  if (lineSelectionGesture) releasePointer(lineSelectionGesture.pointerId)
  if (textGesture) releasePointer(textGesture.pointerId)
  pointers.clear()
  pendingRectangle.value = undefined
  rectangleGesture = undefined
  pendingLine.value = undefined
  lineGesture = undefined
  pendingText.value = undefined
  textGesture = undefined
  if (selectionGesture) replaceRectangle(selectionGesture.initial)
  selectionGesture = undefined
  if (lineSelectionGesture) replaceLine(lineSelectionGesture.original)
  lineSelectionGesture = undefined
  isRotating.value = false
  clearSnapFeedback()
  singlePointerStart = undefined
  pinchStart = undefined
  awaitingTouchRelease.value = false
  isPanning.value = false
  isSpacePressed.value = false
  isShiftPressed.value = false
  latestGesturePoint.value = undefined
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const delta = normalizedWheelDelta(event)
  const current = latestViewport()
  if (event.ctrlKey || event.metaKey) {
    setZoom(current.scale * Math.exp(-delta.y * 0.002), localPoint(event))
    return
  }
  queueViewport({
    ...current,
    translationX: current.translationX - delta.x,
    translationY: current.translationY - delta.y,
  })
}

function normalizedWheelDelta(event: WheelEvent): Point {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return { x: event.deltaX * 16, y: event.deltaY * 16 }
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return { x: event.deltaX * size.x, y: event.deltaY * size.y }
  }
  return { x: event.deltaX, y: event.deltaY }
}

function editableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
}

function onKeyDown(event: KeyboardEvent) {
  if (editableTarget(event.target) || event.isComposing || event.defaultPrevented) return
  if (event.key === 'Shift') {
    if (!isShiftPressed.value) {
      rebaseProportionalResize()
      isShiftPressed.value = true
      refreshActiveGesture()
    }
    return
  }
  isShiftPressed.value = event.shiftKey
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.shiftKey ? redoScene() : undoScene()
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    redoScene()
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'c' && copySelectedShape()) {
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'v' && pasteShape()) {
    event.preventDefault()
    return
  }
  if ((event.ctrlKey || event.metaKey) && key === 'g' && groupSelectedShapes()) {
    event.preventDefault()
    return
  }
  if (event.key === 'Enter' && props.activeTool === 'select' && selectedRectangle.value && isText(selectedRectangle.value)) {
    event.preventDefault()
    editText(selectedRectangle.value)
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && deleteSelectedShape()) {
    event.preventDefault()
    return
  }
  const nudges: Record<string, Point> = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  }
  const nudge = nudges[event.key]
  const distance = event.shiftKey ? 10 : 1
  if (nudge && moveSelectedShape(nudge.x * distance, nudge.y * distance)) {
    event.preventDefault()
    return
  }
  if (event.code === 'Space') {
    isSpacePressed.value = true
    event.preventDefault()
  } else if (event.key === '+' || event.key === '=') {
    stepZoom(1)
    event.preventDefault()
  } else if (event.key === '-') {
    stepZoom(-1)
    event.preventDefault()
  } else if (event.key === '0') {
    resetZoom()
    event.preventDefault()
  } else if (event.key.toLowerCase() === 'r') {
    emit('activateRectangle')
    event.preventDefault()
  } else if (key === 'c' || key === 'o') {
    emit('activateEllipse')
    event.preventDefault()
  } else if (key === 'l') {
    emit('activateLine')
    event.preventDefault()
  } else if (key === 't' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    emit('activateText')
    event.preventDefault()
  } else if (event.key === 'Escape') {
    cancelGesture()
    clearSelection()
    emit('cancelTool')
  }
}

function onDoubleClick(event: MouseEvent) {
  if (props.activeTool !== 'select' || textEditor.value || isSpacePressed.value || editableTarget(event.target)) return
  const point = localPoint(event)
  const worldPoint = screenToWorld(point, latestViewport())
  const hit = [...rectangles.value].reverse().find((shape) => containsPoint(shape, worldPoint))
  if (hit && isText(hit)) editText(hit)
  else if (hit) editLabel(hit)
  else startTextEditor({ kind: 'text', text: '', x: worldPoint.x, y: worldPoint.y - 10, width: 16, height: 20, fontSize: 16, wrap: false })
  event.preventDefault()
}

function onTextEditorKeyDown(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.isComposing) return
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault()
    finishTextEditor()
    root.value?.focus({ preventScroll: true })
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') isSpacePressed.value = false
  if (event.key === 'Shift' && isShiftPressed.value) {
    rebaseProportionalResize()
    isShiftPressed.value = false
    refreshActiveGesture()
  }
}

function onResize(width: number, height: number) {
  const nextSize = { x: width, y: height }
  applyViewport(resizeAroundCenter(viewport, size, nextSize))
  Object.assign(size, nextSize)
}

onMounted(async () => {
  await nextTick()
  if (!root.value) return
  const bounds = root.value.getBoundingClientRect()
  onResize(bounds.width, bounds.height)
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) onResize(entry.contentRect.width, entry.contentRect.height)
  })
  resizeObserver.observe(root.value)
  window.addEventListener('blur', cancelGesture)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', cancelGesture)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('blur', cancelGesture)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('visibilitychange', cancelGesture)
  window.clearTimeout(announceTimer)
  if (viewportFrame !== undefined) window.cancelAnimationFrame(viewportFrame)
})
</script>

<template>
  <section
    ref="root"
    class="infinite-canvas"
    :class="cursorClass"
    tabindex="0"
    role="application"
    aria-label="Drawing canvas"
    @contextmenu.prevent
    @keydown="onKeyDown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="finishPointer"
    @pointercancel="cancelPointer"
    @lostpointercapture="finishPointer"
    @dblclick="onDoubleClick"
    @wheel="onWheel"
  >
    <svg class="canvas-surface" width="100%" height="100%" aria-hidden="true">
      <defs>
        <pattern
          id="sparse-dot-pattern"
          patternUnits="userSpaceOnUse"
          :x="patternX"
          :y="patternY"
          :width="spacing"
          :height="spacing"
        >
          <circle cx="0" cy="0" r="1" class="guide-dot" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sparse-dot-pattern)" />
      <g :transform="`translate(${viewport.translationX} ${viewport.translationY}) scale(${viewport.scale})`">
        <line
          v-for="line in lines"
          :key="line.id"
          :x1="line.start.x"
          :y1="line.start.y"
          :x2="line.end.x"
          :y2="line.end.y"
          class="drawn-line"
        />
        <g
          v-for="rectangle in rectangles.filter((shape) => !isEllipse(shape) && !isText(shape))"
          :key="rectangle.id"
          :transform="`rotate(${rectangle.rotation} ${rectangle.x + rectangle.width / 2} ${rectangle.y + rectangle.height / 2})`"
        >
          <rect
          :x="rectangle.x"
          :y="rectangle.y"
          :width="rectangle.width"
          :height="rectangle.height"
          :rx="rectangle.cornerRadius"
          :ry="rectangle.cornerRadius"
          class="drawn-rectangle"
          />
          <text
            v-if="rectangle.label && textEditor?.shapeId !== rectangle.id"
            :x="rectangle.x + rectangle.width / 2"
            :y="rectangle.y + rectangle.height / 2"
            :font-size="rectangle.labelFontSize ?? 16"
            class="shape-label"
          >
            <tspan
              v-for="(line, index) in wrapText(rectangle.label, labelTextWidth(rectangle), rectangle.labelFontSize ?? 16)"
              :key="index"
              :x="rectangle.x + rectangle.width / 2"
              :dy="index === 0 ? -(wrapText(rectangle.label, labelTextWidth(rectangle), rectangle.labelFontSize ?? 16).length - 1) * (rectangle.labelFontSize ?? 16) * 0.625 : (rectangle.labelFontSize ?? 16) * 1.25"
            >{{ line }}</tspan>
          </text>
        </g>
        <g
          v-for="ellipse in rectangles.filter(isEllipse)"
          :key="ellipse.id"
          :transform="`rotate(${ellipse.rotation} ${ellipse.x + ellipse.width / 2} ${ellipse.y + ellipse.height / 2})`"
        >
          <ellipse
          :cx="ellipse.x + ellipse.width / 2"
          :cy="ellipse.y + ellipse.height / 2"
          :rx="ellipse.width / 2"
          :ry="ellipse.height / 2"
          class="drawn-ellipse"
          />
          <text
            v-if="ellipse.label && textEditor?.shapeId !== ellipse.id"
            :x="ellipse.x + ellipse.width / 2"
            :y="ellipse.y + ellipse.height / 2"
            :font-size="ellipse.labelFontSize ?? 16"
            class="shape-label"
          >
            <tspan
              v-for="(line, index) in wrapText(ellipse.label, labelTextWidth(ellipse), ellipse.labelFontSize ?? 16)"
              :key="index"
              :x="ellipse.x + ellipse.width / 2"
              :dy="index === 0 ? -(wrapText(ellipse.label, labelTextWidth(ellipse), ellipse.labelFontSize ?? 16).length - 1) * (ellipse.labelFontSize ?? 16) * 0.625 : (ellipse.labelFontSize ?? 16) * 1.25"
            >{{ line }}</tspan>
          </text>
        </g>
        <text
          v-for="text in rectangles.filter(isText)"
          :key="text.id"
          v-show="textEditor?.shapeId !== text.id"
          :transform="`rotate(${text.rotation} ${text.x + text.width / 2} ${text.y + text.height / 2})`"
          :x="text.x"
          :y="text.y + (textLayouts.get(text.id)?.baseline ?? text.fontSize)"
          :font-size="text.fontSize"
          class="drawn-text"
        >
          <tspan v-for="(line, index) in textLayouts.get(text.id)?.lines" :key="index" :x="text.x" :dy="index ? text.fontSize * 1.25 : 0">{{ line }}</tspan>
        </text>
        <rect
          v-if="pendingRectangle && !isEllipse(pendingRectangle)"
          :x="pendingRectangle.x"
          :y="pendingRectangle.y"
          :width="pendingRectangle.width"
          :height="pendingRectangle.height"
          class="drawn-rectangle is-pending"
        />
        <ellipse
          v-if="pendingRectangle && isEllipse(pendingRectangle)"
          :cx="pendingRectangle.x + pendingRectangle.width / 2"
          :cy="pendingRectangle.y + pendingRectangle.height / 2"
          :rx="pendingRectangle.width / 2"
          :ry="pendingRectangle.height / 2"
          class="drawn-ellipse is-pending"
        />
        <line
          v-if="pendingLine"
          :x1="pendingLine.start.x"
          :y1="pendingLine.start.y"
          :x2="pendingLine.end.x"
          :y2="pendingLine.end.y"
          class="drawn-line is-pending"
        />
        <rect
          v-if="pendingText"
          :x="pendingText.x"
          :y="pendingText.y"
          :width="pendingText.width"
          :height="pendingText.height"
          class="text-box-preview"
        />
        <SnapGuides
          :alignment-guides="alignmentGuides"
          :spacing-markers="spacingMarkers"
          :scale="viewport.scale"
        />
        <g v-if="selectedLine && !hasMultipleSelection" class="selection-overlay">
          <line
            :x1="selectedLine.start.x"
            :y1="selectedLine.start.y"
            :x2="selectedLine.end.x"
            :y2="selectedLine.end.y"
            class="selection-line"
          />
          <circle :cx="selectedLine.start.x" :cy="selectedLine.start.y" :r="3 / viewport.scale" class="selection-handle" />
          <circle :cx="selectedLine.end.x" :cy="selectedLine.end.y" :r="3 / viewport.scale" class="selection-handle" />
        </g>
        <g
          v-if="selectionFrame && selectionCorners && selectionEdges && curveHandles && rotationHandle && rotationStemStart"
          class="selection-overlay"
          :class="{ 'is-text-selection': isTextSelected }"
        >
          <rect
            :x="selectionFrame.x"
            :y="selectionFrame.y"
            :width="selectionFrame.width"
            :height="selectionFrame.height"
            :transform="`rotate(${selectionFrame.rotation} ${selectionFrame.x + selectionFrame.width / 2} ${selectionFrame.y + selectionFrame.height / 2})`"
            class="selection-outline"
          />
          <line
            :x1="rotationStemStart.x"
            :y1="rotationStemStart.y"
            :x2="rotationHandle.x"
            :y2="rotationHandle.y"
            class="rotation-stem"
          />
          <circle
            v-for="(corner, name) in selectionCorners"
            :key="name"
            :cx="corner.x"
            :cy="corner.y"
            :r="(hoveredSelectionHandle === name ? 4 : 3) / viewport.scale"
            class="selection-handle"
            :class="{ 'is-highlighted': hoveredSelectionHandle === name }"
          />
          <template v-if="isTextSelected">
            <rect
              v-for="edge in [selectionEdges.east, selectionEdges.west]"
              :key="`${edge.x}-${edge.y}`"
              :x="edge.x - 2 / viewport.scale"
              :y="edge.y - 4 / viewport.scale"
              :width="4 / viewport.scale"
              :height="8 / viewport.scale"
              :rx="2 / viewport.scale"
              :transform="`rotate(${selectionFrame.rotation} ${edge.x} ${edge.y})`"
              class="selection-handle"
            />
          </template>
          <template v-else>
            <circle
              v-for="(edge, name) in selectionEdges"
              :key="name"
              :cx="edge.x"
              :cy="edge.y"
              :r="(hoveredSelectionHandle === name ? 4 : 3) / viewport.scale"
              class="selection-handle"
              :class="{ 'is-highlighted': hoveredSelectionHandle === name }"
            />
          </template>
          <circle
            v-if="showCurveControls"
            v-for="(curve, name) in visibleCurveHandles"
            :key="`curve-${name}`"
            :cx="curve.x"
            :cy="curve.y"
            :r="curveHandleRadius"
            class="curve-handle"
          />
        </g>
      </g>
    </svg>

    <textarea
      v-if="textEditor"
      ref="textArea"
      v-model="textEditor.text"
      class="text-editor canvas-text-input"
      :class="{ 'is-label-editor': textEditor.kind === 'label', 'is-wrapped-editor': textEditor.wrap }"
      :style="textEditorStyle"
      :wrap="textEditor.wrap ? 'soft' : 'off'"
      aria-label="Text editor"
      spellcheck="false"
      rows="1"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @dblclick.stop
      @blur="finishTextEditor()"
      @input="updateTextEditor"
      @keydown="onTextEditorKeyDown"
    />

    <div
      v-if="rotationHandleScreen"
      class="selection-rotate-control"
      :class="{ 'is-highlighted': hoveredSelectionHandle === 'rotate' }"
      :style="{
        left: `${rotationHandleScreen.x}px`,
        top: `${rotationHandleScreen.y}px`,
        transform: 'translate(-50%, -50%)',
      }"
      aria-hidden="true"
    >
      <RotateCw class="selection-rotate-icon" :stroke-width="1.6" />
    </div>

    <div class="viewport-controls" role="group" aria-label="Canvas zoom controls">
            <TooltipProvider>
              <Tooltip text="Zoom out" placement="top">
                <Button
                  size="md"
                  variant="ghost"
                  theme="gray"
                  label="Zoom out"
                  :disabled="viewport.scale <= MIN_SCALE"
                  @click="stepZoom(-1)"
                >
                  <ZoomOut class="viewport-control-icon" aria-hidden="true" />
                </Button>
              </Tooltip>
              <Tooltip text="Reset zoom to 100%" placement="top">
                <Button
                  size="md"
                  variant="ghost"
                  theme="gray"
                  label="Reset zoom to 100%"
                  @click="resetZoom"
                >
                  <span class="zoom-label">{{ zoomLabel }}</span>
                </Button>
              </Tooltip>
              <Tooltip text="Zoom in" placement="top">
                <Button
                  size="md"
                  variant="ghost"
                  theme="gray"
                  label="Zoom in"
                  :disabled="viewport.scale >= MAX_SCALE"
                  @click="stepZoom(1)"
                >
                  <ZoomIn class="viewport-control-icon" aria-hidden="true" />
                </Button>
              </Tooltip>
            </TooltipProvider>
    </div>

    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</p>
  </section>
</template>

<style scoped>
.infinite-canvas {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  outline: none;
  background: var(--surface-base);
  cursor: default;
  user-select: none;
  --selection-blue: #4285f4;
}

.infinite-canvas.is-pan-ready {
  cursor: grab;
}

.infinite-canvas.is-panning {
  cursor: grabbing;
}

.infinite-canvas.is-drawing-shape {
  cursor: crosshair;
}

.infinite-canvas.is-text-ready {
  cursor: crosshair;
}

.infinite-canvas.is-rotation-ready {
  cursor: grab;
}

.infinite-canvas.is-rotating {
  cursor: grabbing;
}

.infinite-canvas.is-curve-ready {
  cursor: grab;
}

.infinite-canvas.is-move-ready {
  cursor: move;
}

.infinite-canvas.is-resize-ns {
  cursor: ns-resize;
}

.infinite-canvas.is-resize-ew {
  cursor: ew-resize;
}

.infinite-canvas.is-resize-nwse {
  cursor: nwse-resize;
}

.infinite-canvas.is-resize-nesw {
  cursor: nesw-resize;
}

.canvas-surface {
  position: absolute;
  inset: 0;
  display: block;
  background: var(--surface-white);
  pointer-events: none;
}

.drawn-rectangle,
.drawn-ellipse,
.drawn-line {
  fill: none;
  stroke: var(--ink-gray-7, #525252);
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.drawn-line {
  stroke-linecap: round;
}

.drawn-text,
.shape-label {
  fill: var(--ink-gray-9, #171717);
  font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
  dominant-baseline: alphabetic;
  white-space: pre;
}

.shape-label {
  text-anchor: middle;
  dominant-baseline: middle;
}

.text-editor {
  position: absolute;
  z-index: 2;
  outline: 0 !important;
  box-shadow: none !important;
  background: transparent;
  color: var(--ink-gray-9, #171717);
  font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
  border-radius: 0;
  user-select: text;
  touch-action: auto;
}

.text-editor:focus {
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

.text-editor.is-wrapped-editor {
  white-space: pre-wrap;
  outline: 1px dashed var(--outline-gray-3) !important;
  outline-offset: 4px;
}

.text-editor.is-label-editor {
  text-align: center;
  box-sizing: border-box;
  overflow: hidden;
  padding: 0;
  resize: none;
  outline: 0 !important;
}

.text-box-preview {
  fill: rgb(66 133 244 / 6%);
  stroke: var(--selection-blue);
  stroke-dasharray: 4 3;
  stroke-width: 1px;
}

.drawn-rectangle.is-pending,
.drawn-ellipse.is-pending,
.drawn-line.is-pending {
  stroke-dasharray: 4 3;
}

.selection-outline {
  fill: none;
  stroke: var(--selection-blue);
  stroke-width: 1px;
}

.selection-outline,
.selection-handle,
.rotation-stem,
.curve-handle,
.text-box-preview {
  vector-effect: non-scaling-stroke;
}

.selection-line {
  stroke: var(--selection-blue);
  stroke-width: 6px;
  stroke-opacity: 0.2;
  vector-effect: non-scaling-stroke;
}

.rotation-stem {
  stroke: var(--selection-blue);
  stroke-width: 1px;
}

.selection-handle {
  fill: var(--surface-white, #fff);
  stroke: var(--selection-blue);
  stroke-width: 1px;
  transition: fill 100ms ease;
}

.selection-handle.is-highlighted {
  fill: var(--selection-blue);
}

.selection-rotate-control {
  position: absolute;
  z-index: 1;
  display: flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--selection-blue);
  border-radius: 50%;
  background: var(--surface-base);
  color: var(--selection-blue);
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: background-color 100ms ease, color 100ms ease;
}

.selection-rotate-control.is-highlighted {
  background: var(--selection-blue);
  color: var(--surface-white, #fff);
}

.selection-rotate-icon {
  width: 13px;
  height: 13px;
}

.curve-handle {
  fill: var(--surface-white, #fff);
  stroke: var(--selection-blue);
  stroke-width: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .selection-handle,
  .selection-rotate-control {
    transition: none;
  }
}

.guide-dot {
  fill: var(--ink-gray-4);
  fill-opacity: 0.55;
}

.viewport-controls {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--outline-gray-1);
  border-radius: 10px;
  background: var(--surface-base);
  box-shadow: var(--shadow-sm);
}

.zoom-label {
  min-width: 40px;
  color: var(--ink-gray-8);
  font-family: InterVar, ui-sans-serif, system-ui, sans-serif;
  font-size: 12px;
  font-weight: normal;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.viewport-control-icon {
  width: 18px;
  height: 18px;
  stroke-width: 1.5;
}

@media (pointer: coarse) {
  .viewport-controls :deep(button) {
    min-width: 44px;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .infinite-canvas,
  .infinite-canvas * {
    transition: none !important;
  }
}
</style>
