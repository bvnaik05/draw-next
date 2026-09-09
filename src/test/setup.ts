import { defineComponent, h } from 'vue'
import { vi } from 'vitest'

vi.mock('frappe-ui', () => ({
  Button: defineComponent({
    name: 'FrappeButtonStub',
    inheritAttrs: false,
    props: { label: String },
    setup(props, { attrs, slots }) {
      return () => h('button', { ...attrs, 'aria-label': props.label }, slots.default?.())
    },
  }),
}))

vi.mock('frappe-ui/src/components/Tooltip/Tooltip.vue', () => ({
  default: defineComponent({
    name: 'FrappeTooltipStub',
    props: { text: String, placement: String },
    setup(_, { slots }) {
      return () => slots.default?.()
    },
  }),
}))

vi.mock('frappe-ui/src/components/Tooltip/TooltipProvider.vue', () => ({
  default: defineComponent({
    name: 'FrappeTooltipProviderStub',
    setup(_, { slots }) {
      return () => slots.default?.()
    },
  }),
}))
