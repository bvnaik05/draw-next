<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'
import { toast } from 'frappe-ui/src/components/Toast/toast'
import { Dropdown } from 'frappe-ui/src/components/Dropdown'
import { dialog } from 'frappe-ui/src/utils/dialog'
import FrappeUIProvider from 'frappe-ui/src/components/Provider/FrappeUIProvider.vue'
import { useRouter } from 'vue-router'
import { CalendarDays, ChevronDown, ChevronUp, Copy, Eye, FileText, HardDrive, Mail, PenLine, Plus, Presentation as Slides, Search, Table2, Trash, Video, ArrowDownAZ, ArrowUpZA, PanelsTopLeft } from 'lucide-vue-next'
import drawLogo from './assets/draw-logo.svg'
import type { Scene, Shape } from './canvas/selection'
import { bounds, isLine } from './canvas/selection'
import { freeDrawPath } from './canvas/scene'

type Drawing = { name: string; title: string; content: string; creation: string; modified: string }
const doctype = 'Draw Next Drawing'
const router = useRouter()
const drawings = ref<Drawing[]>([])
const loading = ref(true)
const loadFailed = ref(false)
const creating = ref(false)
const search = ref('')
const sort = ref<'modified' | 'creation' | 'title'>('modified')
const ascending = ref(false)
const sortOptions = [
  { label: 'Title', onClick: () => { sort.value = 'title' } },
  { label: 'Edited', onClick: () => { sort.value = 'modified' } },
  { label: 'Created', onClick: () => { sort.value = 'creation' } },
]
const sortLabel = computed(() => ({ title: 'Title', modified: 'Edited', creation: 'Created' })[sort.value])
const preview = ref<Drawing | null>(null)
const csrf = ref('')
let csrfReady: Promise<void> | undefined
const editorRoute = (name: string) => ({ name: 'editor', query: { drawing: name } })
const suiteApps = [
  { label: 'Drive', path: '/drive', icon: HardDrive },
  { label: 'Slides', path: '/slides', icon: Slides },
  { label: 'Writer', path: '/writer', icon: FileText },
  { label: 'Sheets', path: '/sheets', icon: Table2 },
  { label: 'Meet', path: '/meet', icon: Video },
  { label: 'Mail', path: '/mail', icon: Mail },
  { label: 'Calendar', path: '/calendar', icon: CalendarDays },
]
function suiteUrl(path: string) {
  const url = new URL(path, location.origin)
  if (location.port === '8082') {
    url.hostname = 'localhost'
    url.port = '8085'
  }
  return url.href
}
const homeMenuOptions = [
  {
    group: '',
    options: [{
      label: 'Apps',
      icon: 'lucide-layout-grid',
      submenu: suiteApps.map(app => ({
        label: app.label,
        icon: h(app.icon, { class: '!size-5' }),
        onClick: () => window.location.assign(suiteUrl(app.path)),
      })),
    }],
  },
  {
    group: '',
    options: [
      { label: 'Settings', icon: 'lucide-settings', onClick: () => window.location.assign(suiteUrl('/draw?openSettings=profile')) },
      { label: 'Log out', icon: 'lucide-log-out', onClick: logout },
    ],
  },
]
const thumbnailShapes = new WeakMap<Drawing, Shape[]>()
const thumbnailViewBoxes = new WeakMap<Drawing, string>()
const visible = computed(() => drawings.value.filter(d => d.title.toLowerCase().includes(search.value.toLowerCase())).sort((a, b) => {
  const difference = a[sort.value].localeCompare(b[sort.value])
  return ascending.value ? difference : -difference
}))
const scene = (drawing: Drawing): Scene | null => {
  try {
    const value = typeof drawing.content === 'string' ? JSON.parse(drawing.content) : drawing.content
    return Array.isArray(value.rectangles) && Array.isArray(value.lines) ? value : null
  } catch { return null }
}
const shapes = (drawing: Drawing): Shape[] => {
  const cached = thumbnailShapes.get(drawing)
  if (cached) return cached
  const value = scene(drawing)
  const result = value ? [...value.rectangles, ...value.lines].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []
  thumbnailShapes.set(drawing, result)
  return result
}
const viewBox = (drawing: Drawing) => {
  const cached = thumbnailViewBoxes.get(drawing)
  if (cached) return cached
  const box = bounds(shapes(drawing))
  if (!box) return '0 0 800 450'
  const width = Math.max(box.width * 1.35, box.height * 2.4, 200)
  const height = width * 9 / 16
  const result = `${box.x + box.width / 2 - width / 2} ${box.y + box.height / 2 - height / 2} ${width} ${height}`
  thumbnailViewBoxes.set(drawing, result)
  return result
}
const points = (shape: Shape) => {
  if (isLine(shape)) return ''
  return `${shape.x + shape.width / 2},${shape.y} ${shape.x + shape.width},${shape.y + shape.height / 2} ${shape.x + shape.width / 2},${shape.y + shape.height} ${shape.x},${shape.y + shape.height / 2}`
}
const kind = (shape: Shape): string => 'kind' in shape ? shape.kind : ''
const freePath = (shape: Shape) => kind(shape) === 'freedraw' ? freeDrawPath(shape as Extract<Shape, { kind: 'freedraw' }>) : ''
const imageSource = (shape: Shape) => kind(shape) === 'image' ? (shape as Extract<Shape, { kind: 'image' }>).src : ''
const textShape = (shape: Shape) => kind(shape) === 'text' ? shape as Extract<Shape, { kind: 'text' }> : null
const edited = (date: string) => {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 60) return 'a month ago'
  return `${Math.floor(days / 30)} months ago`
}
async function request(path: string, method = 'GET', body?: unknown) {
  try {
    if (method !== 'GET') await csrfReady
    const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrf.value }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      let message = data?.message
      try {
        message ||= JSON.parse(JSON.parse(data?._server_messages ?? '[]')[0] ?? '{}').message
      } catch { /* use the error type or status below */ }
      throw new Error(message || data?.exc_type || `Frappe returned HTTP ${response.status}`)
    }
    return method === 'DELETE' ? undefined : response.json()
  } catch (cause) {
    const networkError = cause instanceof TypeError
    toast.error(networkError ? 'Could not connect to Frappe' : 'Frappe request failed', { description: networkError ? 'Please check your connection and try again.' : cause instanceof Error ? cause.message : 'Please try again.' })
    throw cause
  }
}
async function refresh() {
  loading.value = true
  try {
    const data = await request(`/api/resource/${encodeURIComponent(doctype)}?fields=` + encodeURIComponent(JSON.stringify(['name', 'title', 'scene', 'creation', 'modified'])) + '&limit_page_length=1000')
    drawings.value = data.data.map((drawing: Drawing & { scene: string }) => ({ ...drawing, content: drawing.scene }))
    loadFailed.value = false
  } catch { loadFailed.value = true }
  finally { loading.value = false }
}
async function loadCsrf() {
  csrf.value = (window as Window & { csrf_token?: string }).csrf_token ?? ''
  if (!csrf.value || csrf.value === '{{ csrf_token }}') {
    const desk = await fetch('/desk', { credentials: 'same-origin' }).then(r => r.text())
    csrf.value = desk.match(/frappe.csrf_token\s*=\s*["']([^"']+)/)?.[1] ?? ''
  }
  if (!csrf.value || csrf.value === '{{ csrf_token }}') throw new Error('Could not get the Frappe session token. Reload the page.')
}
async function logout() {
  try {
    await request('/api/method/logout', 'POST')
    window.location.assign('/login')
  } catch { /* request shows the error */ }
}
async function createDrawing() {
  if (creating.value) return
  creating.value = true
  try {
    const result = await request(`/api/resource/${encodeURIComponent(doctype)}`, 'POST', { doctype, title: 'Untitled Drawing', scene: JSON.stringify({ rectangles: [], lines: [] }) })
    await router.push(editorRoute(result.data.name))
  } catch { creating.value = false }
}
function rename(drawing: Drawing) {
  dialog.prompt({ title: 'Rename drawing', fields: [{ name: 'title', label: 'Title', required: true, defaultValue: drawing.title, validate: value => value.trim() ? null : 'Title is required' }], confirmLabel: 'Rename', onConfirm: async ({ values }) => {
    const title = values.title.trim()
    await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(drawing.name)}`, 'PUT', { title })
    drawing.title = title
  } })
}
async function duplicate(drawing: Drawing) {
  try {
    const copy = await request(`/api/resource/${encodeURIComponent(doctype)}`, 'POST', { doctype, title: `${drawing.title} Copy`, scene: drawing.content })
    const now = new Date().toISOString()
    drawings.value.unshift({ ...drawing, name: copy.data.name, title: `${drawing.title} Copy`, creation: copy.data.creation ?? now, modified: copy.data.modified ?? now })
  } catch { /* request shows the toast */ }
}
function remove(drawing: Drawing) {
  dialog.confirm({
    title: 'Delete drawing',
    message: `"${drawing.title}" will be deleted.`,
    confirmLabel: 'Delete',
    theme: 'red',
    onConfirm: async () => {
      await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(drawing.name)}`, 'DELETE')
      drawings.value = drawings.value.filter(item => item.name !== drawing.name)
      if (preview.value?.name === drawing.name) preview.value = null
    },
  })
}
const menuOptions = (drawing: Drawing) => [
  { group: 'Actions', options: [
    { label: 'Rename', icon: h(PenLine, { class: 'stroke-[1.5] !size-3.5' }), onClick: () => rename(drawing) },
    { label: 'Duplicate', icon: h(Copy, { class: 'stroke-[1.5] !size-3.5' }), onClick: () => duplicate(drawing) },
    { label: 'Delete', icon: h(Trash, { class: 'stroke-[1.5] !size-3.5' }), onClick: () => remove(drawing) },
  ] },
  { group: 'Explore', options: [
    { label: 'Preview', icon: h(Eye, { class: 'stroke-[1.5] !size-3.5' }), onClick: () => { preview.value = drawing } },
  ] },
]
onMounted(() => {
  csrfReady = loadCsrf()
  void csrfReady.catch(cause => toast.error('Could not prepare drawing actions', { description: cause instanceof Error ? cause.message : 'Please try again.' }))
  void refresh()
})
</script>

<template>
  <div class="draw-home">
    <FrappeUIProvider />
    <header class="home-navbar">
      <Dropdown :options="homeMenuOptions" :offset="16">
        <template #default="{ open }">
          <button class="home-brand" type="button" aria-label="Draw menu" :aria-expanded="open">
            <img :src="drawLogo" alt="Draw" />
            <ChevronUp v-if="open" :size="16" :stroke-width="1.5" class="brand-chevron" />
            <ChevronDown v-else :size="16" :stroke-width="1.5" class="brand-chevron" />
          </button>
        </template>
      </Dropdown>
      <Button variant="solid" label="New" :iconLeft="Plus" :disabled="creating" @click="createDrawing" />
    </header>
    <main class="home-content">
      <div class="home-controls">
        <h1 class="text-xl-semibold">Drawings</h1>
        <div class="home-filters">
          <label v-if="drawings.length" class="search-box"><Search :size="19" /><input v-model="search" placeholder="Search" aria-label="Search drawings" /></label>
          <div class="sort-box"><Button class="text-base h-7 border-r border-outline-gray-2 rounded-r-none" :aria-label="ascending ? 'Sort descending' : 'Sort ascending'" @click="ascending = !ascending"><template #icon><ArrowDownAZ v-if="ascending" :size="16" /><ArrowUpZA v-else :size="16" /></template></Button><Dropdown :options="sortOptions" align="end"><Button class="text-base h-7 rounded-l-none">{{ sortLabel }}</Button></Dropdown></div>
        </div>
      </div>
      <div v-if="visible.length" class="drawing-grid">
        <article v-for="drawing in visible" :key="drawing.name" class="drawing-card">
          <RouterLink class="drawing-thumbnail" :to="editorRoute(drawing.name)" :aria-label="`Open ${drawing.title}`">
            <svg v-if="shapes(drawing).length" class="drawing-art" :viewBox="viewBox(drawing)" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <g v-for="shape in shapes(drawing)" :key="shape.id" :opacity="shape.opacity ?? 1">
                <path v-if="isLine(shape)" :d="`M ${shape.start.x} ${shape.start.y} L ${shape.end.x} ${shape.end.y}`" fill="none" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" />
                <path v-else-if="kind(shape) === 'freedraw'" :d="freePath(shape)" fill="none" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" />
                <polygon v-else-if="kind(shape) === 'diamond'" :points="points(shape)" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" />
                <ellipse v-else-if="kind(shape) === 'ellipse'" :cx="shape.x + shape.width / 2" :cy="shape.y + shape.height / 2" :rx="shape.width / 2" :ry="shape.height / 2" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" />
                <image v-else-if="kind(shape) === 'image'" :href="imageSource(shape)" :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" />
                <text v-else-if="kind(shape) === 'text'" :x="shape.x" :y="shape.y + (textShape(shape)?.fontSize ?? 16)" :font-size="textShape(shape)?.fontSize" :fill="shape.fill || '#222'">{{ textShape(shape)?.text }}</text>
                <rect v-else :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" :rx="shape.cornerRadius" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" />
              </g>
            </svg>
            <svg v-else class="size-6 text-ink-gray-3" viewBox="15 15 70 70" fill="none" stroke="currentColor" stroke-width="7" aria-hidden="true">
              <path d="M26.5 26.5H66a7.5 7.5 0 0 1 7.5 7.5V66a7.5 7.5 0 0 1-7.5 7.5H34a7.5 7.5 0 0 1-7.5-7.5V38" stroke-linejoin="round" />
              <path d="M40 62c5-14 10-22 14-22 6 0 2 14 0 19-1 3 3 3 7-1" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </RouterLink>
          <div class="card-details"><div class="card-text"><div class="card-title">{{ drawing.title }}</div><div class="card-date">{{ sort === 'creation' ? 'Created' : 'Edited' }} {{ edited(sort === 'creation' ? drawing.creation : drawing.modified) }}</div></div>
            <Dropdown :options="menuOptions(drawing)" :button="{ icon: 'lucide-ellipsis', variant: 'ghost' }" align="end" />
          </div>
        </article>
      </div>
      <div v-else-if="loading" class="home-empty">Loading drawings…</div>
      <div v-else-if="loadFailed" class="home-empty"><button type="button" @click="refresh">Retry loading drawings</button></div>
      <div v-else-if="search" class="home-empty">No drawings found</div>
      <div v-else class="home-empty"><PanelsTopLeft class="size-8 text-ink-gray-4" /><strong>No drawings yet.</strong><span>Add a new drawing to get started!</span><button type="button" :disabled="creating" @click="createDrawing">New Drawing</button></div>
    </main>
    <div v-if="preview" class="preview-overlay" @click="preview = null"><div class="preview-dialog" @click.stop><button class="preview-close" @click="preview = null">Close</button><div class="preview-art"><svg :viewBox="viewBox(preview)"><g v-for="shape in shapes(preview)" :key="shape.id"><path v-if="isLine(shape)" :d="`M ${shape.start.x} ${shape.start.y} L ${shape.end.x} ${shape.end.y}`" fill="none" :stroke="shape.stroke || '#222'" :stroke-width="shape.strokeWidth ?? 2" /><path v-else-if="kind(shape) === 'freedraw'" :d="freePath(shape)" fill="none" :stroke="shape.stroke || '#222'" /><polygon v-else-if="kind(shape) === 'diamond'" :points="points(shape)" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" /><ellipse v-else-if="kind(shape) === 'ellipse'" :cx="shape.x + shape.width / 2" :cy="shape.y + shape.height / 2" :rx="shape.width / 2" :ry="shape.height / 2" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" /><image v-else-if="kind(shape) === 'image'" :href="imageSource(shape)" :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" /><text v-else-if="kind(shape) === 'text'" :x="shape.x" :y="shape.y + (textShape(shape)?.fontSize ?? 16)" :font-size="textShape(shape)?.fontSize">{{ textShape(shape)?.text }}</text><rect v-else :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" :fill="shape.fill || 'none'" :stroke="shape.stroke || '#222'" /></g></svg></div><h2>{{ preview.title }}</h2><RouterLink :to="editorRoute(preview.name)">Open drawing</RouterLink></div></div>
  </div>
</template>

<style scoped>
.draw-home{height:100%;min-height:100vh;background:white;color:#171717;font-family:InterVar,Inter,ui-sans-serif,system-ui,sans-serif}
.home-navbar{height:48px;border-bottom:1px solid #ededed;display:flex;align-items:center;justify-content:space-between;padding:0 12px}
.home-brand{display:flex;align-items:center;gap:8px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}.home-brand img{width:28px;height:28px}.brand-chevron{color:var(--ink-gray-7)}
.home-content{width:100%;max-width:1088px;margin:0 auto;padding:32px}.home-controls{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:48px}.home-controls h1{margin:0}.home-filters{display:flex;gap:8px}.search-box{height:28px;width:224px;background:#f7f7f7;border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 10px;color:#888}.search-box input{border:0;background:transparent;outline:0;font:inherit;font-size:14px;min-width:0;width:100%}.sort-box{display:flex;align-items:center;white-space:nowrap}.home-error{color:var(--ink-red-3,#b52a2a)}
:deep(.drawing-card button:focus:not(:focus-visible)){outline:none;box-shadow:none}
.drawing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:32px}.drawing-card{min-width:0}.drawing-thumbnail{display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;border:1px solid #e4e4e4;border-radius:6px;box-shadow:0 1px 4px #00000016;overflow:hidden;background:white;color:#aaa}.drawing-art{width:100%;height:100%}.card-details{display:flex;justify-content:space-between;align-items:start;padding-top:12px}.card-text{min-width:0}.card-title,.card-date{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;line-height:20px}.card-title{color:#404040}.card-date{color:#737373;font-size:14px;line-height:18px}.card-menu{position:relative}.menu-trigger{border:0;background:transparent;border-radius:9px;padding:6px;cursor:pointer}.menu-trigger:hover{background:#eee}.menu-popover{position:absolute;right:0;top:40px;z-index:20;width:240px;padding:12px 0;background:white;border:1px solid #e1e1e1;border-radius:17px;box-shadow:0 15px 35px #0002}.menu-heading{padding:5px 20px;color:#888;font-size:16px}.menu-popover button{display:flex;align-items:center;gap:14px;width:100%;padding:8px 20px;border:0;background:white;text-align:left;color:#444;font:inherit;font-size:18px;cursor:pointer}.menu-popover button:hover{background:#f5f5f5}.menu-divider{border-top:1px solid #eee;margin:8px 0}.home-empty{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#777}.home-empty strong{color:#444;font-size:20px}.home-empty a{margin-top:16px;color:#333}.preview-overlay{position:fixed;inset:0;z-index:50;background:#0005;display:grid;place-items:center}.preview-dialog{width:min(800px,90vw);padding:24px;background:white;border-radius:20px}.preview-close{float:right;border:0;background:transparent;cursor:pointer}.preview-art{aspect-ratio:16/9;border:1px solid #eee;margin-top:30px}.preview-art svg{width:100%;height:100%}
@media(max-width:650px){.home-content{padding:30px 20px}.home-controls{align-items:start;flex-direction:column;margin-bottom:35px}.search-box{width:min(100%,250px)}.drawing-grid{gap:28px}}
</style>
