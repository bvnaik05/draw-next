import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import Home from './Home.vue'

const confirm = vi.hoisted(() => vi.fn())

vi.mock('frappe-ui/src/utils/dialog', () => ({ dialog: { confirm, prompt: vi.fn() } }))
vi.mock('frappe-ui/src/components/Provider/FrappeUIProvider.vue', () => ({ default: defineComponent({ render: () => null }) }))
vi.mock('frappe-ui/src/components/Dropdown', () => ({
  Dropdown: defineComponent({
    name: 'DropdownStub',
    props: ['options'],
    setup(props) { return () => h('button', { onClick: () => props.options?.[0]?.options?.find((option: { label: string }) => option.label === 'Delete')?.onClick() }, props.options?.[0]?.group === 'Actions' ? 'Drawing actions' : 'Sort') },
  }),
}))

beforeEach(() => {
  confirm.mockReset()
  ;(window as Window & { csrf_token?: string }).csrf_token = 'test-token'
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: { method?: string }) => options?.method === 'DELETE'
    ? { ok: true, status: 202, json: async () => { throw new SyntaxError('empty response') } }
    : { ok: true, json: async () => ({ data: [{ name: 'drawing-1', title: 'Test drawing', scene: '{"rectangles":[],"lines":[]}', creation: '2026-09-24', modified: '2026-09-24' }] }) }))
})

it('deletes after the Frappe dialog confirms, even when DELETE has no JSON body', async () => {
  const wrapper = mount(Home)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Drawing actions')!.trigger('click')
  const options = confirm.mock.calls[0][0]
  expect(options.title).toBe('Delete drawing')
  await options.onConfirm()
  await flushPromises()
  expect(wrapper.text()).not.toContain('Test drawing')
  expect(fetch).toHaveBeenCalledWith('/api/resource/Draw%20Next%20Drawing/drawing-1', expect.objectContaining({ method: 'DELETE' }))
})

it('keeps the drawing when Frappe rejects deletion', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: { method?: string }) => options?.method === 'DELETE'
    ? { ok: false, status: 403, json: async () => ({ message: 'No permission' }) }
    : { ok: true, json: async () => ({ data: [{ name: 'drawing-1', title: 'Test drawing', scene: '{"rectangles":[],"lines":[]}', creation: '2026-09-24', modified: '2026-09-24' }] }) }))
  const wrapper = mount(Home)
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Drawing actions')!.trigger('click')
  await expect(confirm.mock.calls[0][0].onConfirm()).rejects.toThrow('No permission')
  expect(wrapper.text()).toContain('Test drawing')
})
