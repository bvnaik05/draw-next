import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import App from './App.vue'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('drawing header', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renames the drawing with the Frappe UI text input', async () => {
    const wrapper = mount(App)
    const titleButton = wrapper.get('.title-button')

    expect(titleButton.text()).toBe('Untitled Drawing')
    await titleButton.trigger('click')

    const title = wrapper.get('.title-field input')

    await title.setValue('System Overview')
    await title.trigger('keyup', { key: 'Enter' })
    await nextTick()

    expect(wrapper.get('.title-button').text()).toBe('System Overview')
    wrapper.unmount()
  })

  it('renders Select and drawing tools, and activates shape tools', async () => {
    const wrapper = mount(App)
    const toolbar = wrapper.get('[aria-label="Drawing tools"]')
    const buttons = toolbar.findAll('button')

    expect(buttons).toHaveLength(5)
    expect(buttons.map((button) => button.attributes('aria-label'))).toEqual([
      'Select',
      'Rectangle',
      'Ellipse',
      'Line',
      'Text',
    ])

    expect(buttons[0].classes()).toContain('is-active')

    await buttons[1].trigger('click')
    expect(buttons[1].classes()).toContain('is-active')

    await buttons[2].trigger('click')
    expect(buttons[2].classes()).toContain('is-active')

    await buttons[3].trigger('click')
    expect(buttons[3].classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('prevents browser zoom shortcuts outside the canvas', () => {
    const wrapper = mount(App)
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    })
    const keyboard = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: '+',
    })

    window.dispatchEvent(wheel)
    window.dispatchEvent(keyboard)

    expect(wheel.defaultPrevented).toBe(true)
    expect(keyboard.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('returns to Select when Escape is pressed with a drawing tool armed', async () => {
    const wrapper = mount(App)
    const rectangle = wrapper.get('[aria-label="Rectangle"]')

    await rectangle.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.get('[aria-label="Select"]').classes()).toContain('is-active')
    wrapper.unmount()
  })
})
