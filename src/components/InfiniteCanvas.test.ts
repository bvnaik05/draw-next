import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import InfiniteCanvas from './InfiniteCanvas.vue'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

let animationFrames: FrameRequestCallback[]

function dispatchPointer(
  element: Element,
  type: string,
  { pointerId, pointerType, button = 0, clientX = 0, clientY = 0, shiftKey = false }: PointerEventInit,
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX, clientY, shiftKey })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  })
  element.dispatchEvent(event)
}

function flushAnimationFrame() {
  const callbacks = animationFrames.splice(0)
  callbacks.forEach((callback) => callback(performance.now()))
}

describe('InfiniteCanvas', () => {
  it('keeps the plain text editor open when placing the caret', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'select' } })
    await wrapper.get('section').trigger('dblclick', { clientX: 200, clientY: 200 })
    const editor = wrapper.get('textarea')
    await editor.setValue('Hello\nworld')
    dispatchPointer(editor.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse' })
    await nextTick()
    expect(wrapper.find('textarea').exists()).toBe(true)
    await editor.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.findAll('.drawn-text tspan').map((line) => line.text())).toEqual(['Hello', 'world'])
    wrapper.unmount()
  })

  beforeEach(() => {
    animationFrames = []
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clears temporary Space-pan state when the window loses focus', async () => {
    const wrapper = mount(InfiniteCanvas)
    const canvas = wrapper.get('section')

    await canvas.trigger('keydown', { code: 'Space' })
    expect(canvas.classes()).toContain('is-pan-ready')

    window.dispatchEvent(new Event('blur'))
    await nextTick()

    expect(canvas.classes()).not.toContain('is-pan-ready')
    wrapper.unmount()
  })

  it('does not pan for one primary pen pointer but supports a two-pen pinch', async () => {
    const wrapper = mount(InfiniteCanvas)
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 10,
      clientY: 10,
    })
    await nextTick()
    expect(canvas.classes()).not.toContain('is-panning')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 2,
      pointerType: 'pen',
      clientX: 40,
      clientY: 10,
    })
    await nextTick()
    expect(canvas.classes()).toContain('is-panning')
    wrapper.unmount()
  })

  it('coalesces wheel panning into an animation frame and normalizes line deltas', async () => {
    const wrapper = mount(InfiniteCanvas)
    const canvas = wrapper.get('section')
    const pattern = wrapper.get('pattern')

    canvas.element.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
        deltaY: 2,
      }),
    )

    expect(pattern.attributes('y')).toBe('0')
    expect(animationFrames).toHaveLength(1)

    flushAnimationFrame()
    await nextTick()

    expect(pattern.attributes('y')).toBe('16')
    wrapper.unmount()
  })

  it('resets zoom to 100% when the zoom value is clicked', async () => {
    const wrapper = mount(InfiniteCanvas)

    await wrapper.get('button[aria-label="Zoom in"]').trigger('click')
    flushAnimationFrame()
    await nextTick()
    expect(wrapper.get('.zoom-label').text()).toBe('110%')

    await wrapper.get('.zoom-label').trigger('click')
    flushAnimationFrame()
    await nextTick()

    expect(wrapper.get('.zoom-label').text()).toBe('100%')
    expect(wrapper.find('button[aria-label="Reset view"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the line hit area screen-constant while zoomed', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'line' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 20 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 60, clientY: 20 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 60, clientY: 20 })

    const zoomIn = wrapper.get('button[aria-label="Zoom in"]')
    for (let index = 0; index < 10; index += 1) await zoomIn.trigger('click')
    flushAnimationFrame()
    await nextTick()

    await wrapper.setProps({ activeTool: 'select' })
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 60, clientY: 55 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 2, pointerType: 'mouse', clientX: 60, clientY: 55 })

    expect(wrapper.find('.selection-line').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps selection handles small and clear of the shape when zooming', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200 })
    await wrapper.setProps({ activeTool: 'select' })

    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 92, clientY: 92 })
    await nextTick()
    expect(wrapper.get('.selection-handle.is-highlighted').attributes('r')).toBe('4')
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 500 })
    await nextTick()

    for (const direction of ['Zoom in', 'Zoom out', 'Zoom out']) {
      await wrapper.get(`button[aria-label="${direction}"]`).trigger('click')
      flushAnimationFrame()
      await nextTick()
      const frame = wrapper.get('.selection-outline')
      const inset = 100 - Number(frame.attributes('x'))
      const scale = Number.parseFloat(wrapper.get('.zoom-label').text()) / 100
      expect(inset * scale).toBeCloseTo(3)
      for (const handle of wrapper.findAll('circle.selection-handle')) {
        expect(Number(handle.attributes('r')) * scale).toBeCloseTo(3)
      }
      expect(inset * scale - 3 - 0.5 - 0.75).toBeGreaterThan(0)
      expect(Number(wrapper.get('.drawn-rectangle').attributes('width'))).toBe(200)
    }
    wrapper.unmount()
  })

  it('renders one non-overlapping rotation control', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    await wrapper.get('button[aria-label="Zoom in"]').trigger('click')
    flushAnimationFrame()
    await nextTick()

    expect(wrapper.find('.selection-rotate-control').exists()).toBe(true)
    expect(wrapper.findAll('.selection-handle')).toHaveLength(4)
    wrapper.unmount()
  })

  it('creates a rectangle from the drag bounds in world coordinates', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 60,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 10,
    })
    await nextTick()

    const preview = wrapper.get('.drawn-rectangle.is-pending')
    expect(preview.attributes()).toMatchObject({ x: '20', y: '10', width: '60', height: '50' })

    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 10,
    })
    await nextTick()

    expect(wrapper.find('.drawn-rectangle.is-pending').exists()).toBe(false)
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each(['c', 'o'])('activates the Ellipse tool with %s', async (key) => {
    const wrapper = mount(InfiniteCanvas)

    await wrapper.get('section').trigger('keydown', { key })

    expect(wrapper.emitted('activateEllipse')).toHaveLength(1)
    wrapper.unmount()
  })

  it('activates the Line tool with L', async () => {
    const wrapper = mount(InfiniteCanvas)

    await wrapper.get('section').trigger('keydown', { key: 'l' })

    expect(wrapper.emitted('activateLine')).toHaveLength(1)
    wrapper.unmount()
  })

  it('creates a line from the drag endpoints and records it in history', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'line' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 10,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 80,
      clientY: 60,
    })
    await nextTick()

    expect(wrapper.get('.drawn-line.is-pending').attributes()).toMatchObject({
      x1: '10', y1: '20', x2: '80', y2: '60',
    })

    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 80,
      clientY: 60,
    })
    await nextTick()

    expect(wrapper.findAll('.drawn-line')).toHaveLength(1)
    await canvas.trigger('keydown', { key: 'z', ctrlKey: true })
    expect(wrapper.find('.drawn-line').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows alignment guides and a position readout while moving a shape', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    for (const [pointerId, startX, endX] of [[1, 20, 60], [2, 100, 140]] as const) {
      dispatchPointer(canvas.element, 'pointerdown', {
        pointerId, pointerType: 'mouse', clientX: startX, clientY: 20,
      })
      dispatchPointer(canvas.element, 'pointermove', {
        pointerId, pointerType: 'mouse', clientX: endX, clientY: 60,
      })
      dispatchPointer(canvas.element, 'pointerup', {
        pointerId, pointerType: 'mouse', clientX: endX, clientY: 60,
      })
    }
    await wrapper.setProps({ activeTool: 'select' })

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 3, pointerType: 'mouse', clientX: 120, clientY: 40,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 3, pointerType: 'mouse', clientX: 84, clientY: 40,
    })
    await nextTick()

    expect(wrapper.findAll('.drawn-rectangle')[1]?.attributes('x')).toBe('60')
    expect(wrapper.find('.snap-guide-line').exists()).toBe(true)
    expect(wrapper.get('.position-readout').text()).toBe('60, 20')

    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 3, pointerType: 'mouse', clientX: 84, clientY: 40,
    })
    await nextTick()
    expect(wrapper.find('.snap-guide-line').exists()).toBe(false)
    expect(wrapper.find('.position-readout').exists()).toBe(false)
    wrapper.unmount()
  })

  it('draws a touch line through a shape without snapping or highlighting it', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 160,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 160,
    })
    await wrapper.setProps({ activeTool: 'line' })

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 2, pointerType: 'touch', clientX: 20, clientY: 130,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 130,
    })
    await nextTick()

    expect(wrapper.get('.drawn-line.is-pending').attributes()).toMatchObject({
      x1: '20', y1: '130', x2: '150', y2: '130',
    })

    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 130,
    })
    await nextTick()
    wrapper.unmount()
  })

  it('does not create a line for a click without a drag', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'line' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 20,
    })
    await nextTick()

    expect(wrapper.find('.drawn-line').exists()).toBe(false)
    wrapper.unmount()
  })

  it('moves a selected line and reshapes it from an endpoint', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'line' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 60,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 60,
      clientY: 20,
    })
    await wrapper.setProps({ activeTool: 'select' })

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 40,
      clientY: 40,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 40,
      clientY: 40,
    })

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 3,
      pointerType: 'mouse',
      clientX: 70,
      clientY: 40,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 3,
      pointerType: 'mouse',
      clientX: 90,
      clientY: 70,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 3,
      pointerType: 'mouse',
      clientX: 90,
      clientY: 70,
    })
    await nextTick()

    expect(wrapper.get('.drawn-line').attributes()).toMatchObject({
      x1: '20', y1: '40', x2: '90', y2: '70',
    })
    wrapper.unmount()
  })

  it('preserves the selected shape ratio while Shift-resizing', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 50,
      clientY: 40,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 50,
      clientY: 40,
    })
    await wrapper.setProps({ activeTool: 'select' })

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 54,
      clientY: 44,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 50,
      shiftKey: true,
    })
    await nextTick()

    expect(wrapper.get('.drawn-rectangle').attributes()).toMatchObject({ width: '66', height: '33' })
    wrapper.unmount()
  })

  it('creates, selects, and deletes an ellipse from its drag bounds', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'ellipse' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 80,
      clientY: 60,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 10,
    })
    await nextTick()

    const preview = wrapper.get('.drawn-ellipse.is-pending')
    expect(preview.attributes()).toMatchObject({ cx: '50', cy: '35', rx: '30', ry: '25' })

    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 10,
    })
    await nextTick()

    expect(wrapper.findAll('.drawn-ellipse')).toHaveLength(1)
    await canvas.trigger('keydown', { key: 'Delete' })
    expect(wrapper.find('.drawn-ellipse').exists()).toBe(false)
    wrapper.unmount()
  })

  it('undoes, redoes, and deletes the selected rectangle with keyboard shortcuts', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 50,
      clientY: 30,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 50,
      clientY: 30,
    })
    await nextTick()
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(1)

    await canvas.trigger('keydown', { key: 'Delete' })
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(0)

    await canvas.trigger('keydown', { key: 'z', ctrlKey: true })
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(1)

    await canvas.trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(0)

    await canvas.trigger('keydown', { key: 'z', metaKey: true })
    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(1)
    wrapper.unmount()
  })

  it('copies, pastes, and nudges the selected rectangle by one world unit', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    await canvas.trigger('keydown', { key: 'c', ctrlKey: true })
    await canvas.trigger('keydown', { key: 'v', ctrlKey: true })
    await canvas.trigger('keydown', { key: 'ArrowLeft' })
    await canvas.trigger('keydown', { key: 'ArrowUp' })

    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(2)
    expect(wrapper.findAll('.drawn-rectangle')[1].attributes()).toMatchObject({ x: '19', y: '19' })
    wrapper.unmount()
  })

  it('shift-selects shapes and groups them with Ctrl+G', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 30 })
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 20 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 140, clientY: 40 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 2, pointerType: 'mouse', clientX: 140, clientY: 40 })
    await wrapper.setProps({ activeTool: 'select' })

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 3, pointerType: 'mouse', clientX: 20, clientY: 20 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 3, pointerType: 'mouse', clientX: 20, clientY: 20 })
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 4, pointerType: 'mouse', clientX: 110, clientY: 30, shiftKey: true })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 4, pointerType: 'mouse', clientX: 110, clientY: 30, shiftKey: true })
    await canvas.trigger('keydown', { key: 'g', ctrlKey: true })
    await canvas.trigger('keydown', { key: 'ArrowRight' })

    expect(wrapper.findAll('.drawn-rectangle')).toHaveLength(2)
    expect(wrapper.findAll('.drawn-rectangle').map((shape) => shape.attributes('x'))).toEqual(['11', '101'])
    wrapper.unmount()
  })

  it('discards an in-progress rectangle when the pointer is cancelled', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 10,
      clientY: 10,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1,
      pointerType: 'pen',
      clientX: 40,
      clientY: 40,
    })
    dispatchPointer(canvas.element, 'pointercancel', { pointerId: 1, pointerType: 'pen' })
    await nextTick()

    expect(wrapper.find('.drawn-rectangle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('arms the Text tool with T', async () => {
    const wrapper = mount(InfiniteCanvas)

    await wrapper.get('section').trigger('keydown', { key: 't' })

    expect(wrapper.emitted('activateText')).toHaveLength(1)
    wrapper.unmount()
  })

  it('creates a standalone text box from a Text tool drag', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'text' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1, pointerType: 'mouse', clientX: 90, clientY: 20,
    })
    await nextTick()
    expect(wrapper.get('.text-box-preview').attributes()).toMatchObject({ width: '80', height: '20' })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1, pointerType: 'mouse', clientX: 90, clientY: 20,
    })
    await nextTick()

    const editor = wrapper.get('textarea')
    await editor.setValue('System overview')
    await editor.trigger('blur')

    expect(wrapper.get('.drawn-text').text()).toBe('System overview')
    expect(wrapper.find('.selection-outline').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not reflow text from pointer jitter on a selection handle', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'text' } })
    const canvas = wrapper.get('section')
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 100 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 100 })
    await wrapper.get('textarea').setValue('Stable text')
    await wrapper.get('textarea').trigger('blur')
    await wrapper.setProps({ activeTool: 'select' })

    const text = wrapper.get('.drawn-text')
    const position = { x: text.attributes('x'), y: text.attributes('y') }
    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 2, pointerType: 'mouse', clientX: 97, clientY: 97 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 99, clientY: 99 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 2, pointerType: 'mouse', clientX: 99, clientY: 99 })
    await nextTick()

    expect(text.attributes()).toMatchObject(position)
    wrapper.unmount()
  })

  it('does not pan when selecting existing text for editing', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'select' } })
    const canvas = wrapper.get('section')
    await canvas.trigger('dblclick', { clientX: 200, clientY: 200 })
    await wrapper.get('textarea').setValue('Stable text')
    await wrapper.get('textarea').trigger('blur')
    flushAnimationFrame()
    await nextTick()

    const transform = wrapper.get('.canvas-surface > g').attributes('transform')
    const bounds = vi.spyOn(HTMLTextAreaElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: -100, top: -100, right: 700, bottom: 500, width: 800, height: 600,
    } as DOMRect)
    try {
      await canvas.trigger('dblclick', { clientX: 240, clientY: 230 })
      expect(wrapper.get('textarea').element.value).toBe('Stable text')
      flushAnimationFrame()
      await nextTick()
      expect(wrapper.get('.canvas-surface > g').attributes('transform')).toBe(transform)
    } finally {
      bounds.mockRestore()
      wrapper.unmount()
    }
  })

  it('pans text editing away from the canvas edge', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'select' } })
    const canvas = wrapper.get('section')
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400,
    } as DOMRect)

    await canvas.trigger('dblclick', { clientX: 560, clientY: 20 })
    const editor = wrapper.get('textarea')
    vi.spyOn(editor.element, 'getBoundingClientRect').mockReturnValue({
      left: 560, top: 20, right: 680, bottom: 44, width: 120, height: 24,
    } as DOMRect)
    await editor.setValue('Long text')
    await nextTick()
    flushAnimationFrame()
    await nextTick()

    expect(editor.element.style.left).toBe('448px')
    wrapper.unmount()
  })

  it('opens an empty editor from a Text tool click', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'text' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 20,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 20,
    })
    await nextTick()

    expect(wrapper.find('.text-box-preview').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(true)
    wrapper.unmount()
  })

  it('edits a shape-owned label on double-click', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', {
      pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10,
    })
    dispatchPointer(canvas.element, 'pointermove', {
      pointerId: 1, pointerType: 'mouse', clientX: 110, clientY: 70,
    })
    dispatchPointer(canvas.element, 'pointerup', {
      pointerId: 1, pointerType: 'mouse', clientX: 110, clientY: 70,
    })
    await wrapper.setProps({ activeTool: 'select' })

    await canvas.trigger('dblclick', { clientX: 60, clientY: 40 })
    const editor = wrapper.get('textarea')
    await editor.setValue('Service')
    await editor.trigger('blur')

    expect(wrapper.get('.shape-label').text()).toBe('Service')
    wrapper.unmount()
  })

  it('grows a shape label without showing an editor outline', async () => {
    const wrapper = mount(InfiniteCanvas, { props: { activeTool: 'rectangle' } })
    const canvas = wrapper.get('section')

    dispatchPointer(canvas.element, 'pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 })
    dispatchPointer(canvas.element, 'pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 110, clientY: 70 })
    dispatchPointer(canvas.element, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 110, clientY: 70 })
    await wrapper.setProps({ activeTool: 'select' })

    await canvas.trigger('dblclick', { clientX: 60, clientY: 40 })
    await wrapper.get('textarea').setValue('One\nTwo\nThree\nFour')

    expect(wrapper.get('.drawn-rectangle').attributes('height')).toBe('104')
    expect(wrapper.get('textarea').classes()).toContain('is-label-editor')
    wrapper.unmount()
  })

})
