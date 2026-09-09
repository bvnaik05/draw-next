import { createApp } from 'vue'
import 'frappe-ui/style.css'
import './styles.css'
import App from './App.vue'
import drawLogo from './assets/draw-logo.svg'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = drawLogo
document.head.appendChild(favicon)

createApp(App).mount('#app')
