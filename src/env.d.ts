/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare module 'frappe-ui/src/components/Dropdown' {
  import type { DefineComponent } from 'vue'
  export const Dropdown: DefineComponent<Record<string, unknown>>
}

declare module 'frappe-ui/src/utils/dialog' {
  type DialogAction = {
    label: string
    variant?: 'outline' | 'solid'
    theme?: 'red'
    onClick?: (control: { close: () => void; setError: (message: string | null | undefined) => void }) => void | Promise<void>
  }
  export const dialog: {
    confirm(options: { title: string; message: string; actions: DialogAction[] }): void
    prompt(options: {
      title: string
      fields: { name: string; label: string; required: boolean; defaultValue: string; validate: (value: string) => string | null }[]
      confirmLabel: string
      onConfirm: (context: { values: Record<string, string> }) => Promise<void>
    }): void
  }
}

declare module 'frappe-ui/src/components/Toast/toast' {
  export const toast: {
    error(message: string, options?: { description?: string }): void
    warning(message: string, options?: { description?: string }): void
  }
}
