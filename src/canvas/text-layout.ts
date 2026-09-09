export const TEXT_FONT_FAMILY = 'InterVar, ui-sans-serif, system-ui, sans-serif'
export const TEXT_LINE_HEIGHT = 1.25

export type TextLayout = { lines: string[]; width: number; contentWidth: number; height: number; lineHeight: number; baseline: number }

let context: CanvasRenderingContext2D | undefined

function measure(text: string, fontSize: number): number {
  context ??= document.createElement('canvas').getContext('2d') ?? undefined
  if (!context) return text.length * fontSize * 0.6
  context.font = `${fontSize}px ${TEXT_FONT_FAMILY}`
  return context.measureText(text).width
}

function wrappedLines(text: string, width: number, fontSize: number): string[] {
  const form = document.createElement('form')
  const input = document.createElement('textarea')
  input.name = 'text'
  input.cols = 1
  input.wrap = 'hard'
  input.value = text
  input.className = 'canvas-text-input'
  input.style.cssText = `width: ${width}px; font-size: ${fontSize}px; font-family: ${TEXT_FONT_FAMILY}; white-space: pre-wrap;`
  form.style.cssText = 'position: fixed; visibility: hidden; pointer-events: none;'
  form.append(input)
  document.body.append(form)
  // Hard wrapping exposes the textarea's actual line breaks without submitting anything.
  const wrapped = String(new FormData(form).get('text'))
  form.remove()
  return wrapped.replace(/\r\n?/g, '\n').split('\n')
}

export function layoutText(text: string, width: number, fontSize: number, wrap: boolean): TextLayout {
  const lines = wrap ? wrappedLines(text, Math.max(1, width), fontSize) : text.split('\n')
  const measuredWidth = lines.reduce((maximum, line) => Math.max(maximum, measure(line, fontSize)), fontSize)
  const lineHeight = fontSize * TEXT_LINE_HEIGHT
  const metrics = context?.measureText('Hg')
  const ascent = metrics?.fontBoundingBoxAscent ?? fontSize * 0.8
  const descent = metrics?.fontBoundingBoxDescent ?? fontSize * 0.2
  const baseline = (lineHeight - ascent - descent) / 2 + ascent
  return { lines, width: wrap ? width : measuredWidth, contentWidth: measuredWidth, height: lines.length * lineHeight, lineHeight, baseline }
}
