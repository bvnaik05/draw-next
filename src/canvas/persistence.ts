import { ref } from 'vue'
import { createId } from './scene'
import { parseScene, type Scene } from './selection'

type Drawing = { title: string; scene: Scene; baseModified?: string }
const doctype = 'Draw Next Drawing'
export const saveStatus = ref('Loading drawing…')
export const drawingTitle = ref('Untitled Drawing')
let user = '', csrf = '', name = '', modified = '', key = ''
export const drawingLoading = ref(true)
let ready = false, dirty = false, saving = false
let pending: Drawing | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let database: IDBDatabase | undefined

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) throw new Error(response.status === 409 || response.status === 417 ? 'Drawing changed in another tab. Reload before saving.' : `Save unavailable (${response.status})`)
  return response.json()
}
async function draftStore() {
  if (database) return database
  database = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('draw-next-drafts', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('drafts')
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return database
}
async function draft(action: 'get' | 'put' | 'delete', value?: Drawing) {
  const db = await draftStore()
  return new Promise<Drawing | undefined>((resolve, reject) => {
    const tx = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite')
    const store = tx.objectStore('drafts')
    const operation = action === 'get' ? store.get(key) : action === 'put' ? store.put(value, key) : store.delete(key)
    tx.oncomplete = () => resolve(action === 'get' ? operation.result : undefined)
    tx.onerror = () => reject(tx.error)
  })
}
export async function loadDrawing(): Promise<Scene | undefined> {
  try {
    user = (await request('/api/method/frappe.auth.get_logged_user')).message
    if (!user || user === 'Guest') throw new Error('Sign in to Frappe to save drawings.')
    // The authenticated Desk page supplies the session CSRF token.
    const desk = await fetch('/desk', { credentials: 'same-origin' }).then(r => r.text())
    csrf = desk.match(/frappe.csrf_token\s*=\s*["']([^"']+)/)?.[1] ?? ''
    if (!csrf) throw new Error('Open Frappe and sign in to enable saving.')
    const url = new URL(location.href)
    name = url.searchParams.get('drawing') ?? ''
    if (!name) {
      name = createId('drawing')
      url.searchParams.set('drawing', name)
      history.replaceState(null, '', url)
    }
    key = `${user}:${name}`
    const recovered = await draft('get').catch(() => undefined)
    const result = await request(`/api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(JSON.stringify([['name', '=', name]]))}&fields=${encodeURIComponent(JSON.stringify(['name', 'title', 'scene', 'modified']))}`)
    const doc = result.data[0]
    if (doc) modified = doc.modified
    const drawing = recovered ?? (doc ? { title: doc.title, scene: parseScene(typeof doc.scene === 'string' ? JSON.parse(doc.scene) : doc.scene) } : undefined)
    if (drawing) drawing.scene = parseScene(drawing.scene)
    const conflict = recovered && recovered.baseModified !== modified
    if (conflict) modified = recovered.baseModified ?? ''
    ready = !conflict
    dirty = Boolean(recovered)
    saveStatus.value = conflict ? 'Draft conflicts with saved drawing — copy it into a new drawing' : recovered ? 'Recovered unsynced draft' : doc ? 'Saved' : 'Ready to save'
    if (drawing) {
      drawingTitle.value = drawing.title
      if (recovered && !conflict) setTimeout(() => queueSave(drawing.scene), 0)
      return parseScene(drawing.scene)
    }
  } catch (error) {
    saveStatus.value = error instanceof Error ? error.message : 'Could not load drawing'
  } finally { queueMicrotask(() => { drawingLoading.value = false }) }
}
export function queueSave(scene: Scene) {
  if (drawingLoading.value) return
  dirty = true
  pending = { title: drawingTitle.value.trim() || 'Untitled Drawing', scene: parseScene(scene), baseModified: modified }
  if (!ready) { saveStatus.value = key ? 'Not saved — resolve the load error before saving' : 'Not saved — sign in and reload before editing'; if (key) void draft('put', pending).catch(() => {}); return }
  saveStatus.value = 'Unsaved changes'
  void draft('put', pending).catch(() => { saveStatus.value = 'Draft recovery unavailable — keep this tab open' })
  clearTimeout(timer)
  timer = setTimeout(saveDrawing, 600)
}
export async function saveDrawing() {
  if (!ready || saving || !pending) return
  saving = true
  const next = pending
  saveStatus.value = 'Saving…'
  try {
    const doc = { doctype, name, owner: user, title: next.title, scene: JSON.stringify(next.scene), ...(modified ? { modified } : {}) }
    const result = await request(modified ? '/api/method/frappe.desk.form.save.savedocs' : `/api/resource/${encodeURIComponent(doctype)}`, 'POST', modified ? { doc: JSON.stringify(doc), action: 'Save' } : doc)
    modified = modified ? result.docs[0].modified : result.data.modified
    if (pending && pending !== next) { pending.baseModified = modified; await draft('put', pending) }
    if (pending === next) {
      await draft('delete')
      if (pending === next) { pending = undefined; dirty = false; saveStatus.value = 'Saved' }
    }
  } catch (error) { saveStatus.value = error instanceof Error ? error.message : 'Save failed; draft retained' }
  finally { saving = false }
  if (pending && pending !== next) void saveDrawing()
}
export function warnUnsaved(event: BeforeUnloadEvent) {
  if (dirty) { event.preventDefault(); event.returnValue = '' }
}
