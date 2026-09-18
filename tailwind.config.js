import frappeUIPreset from 'frappe-ui/tailwind'

export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,ts}',
    './node_modules/frappe-ui/src/components/Button/Button.vue',
    './node_modules/frappe-ui/src/components/{Dropdown,Menu}/**/*.{vue,ts}',
    './node_modules/frappe-ui/src/components/Tooltip/**/*.{vue,ts}',
    './node_modules/frappe-ui/src/components/{Popover,Slider,TextInput,InputLabeling,Select,ItemListRow}/**/*.{vue,ts}',
    './node_modules/frappe-ui/src/components/shared/selection/**/*.{vue,ts}',
    './node_modules/frappe-ui/src/components/shared/popover/**/*.{vue,ts}',
  ],
}
