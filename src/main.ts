import { createApp, h } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import 'frappe-ui/style.css'
import './styles.css'
import drawLogo from './assets/draw-logo.svg'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = drawLogo
document.head.appendChild(favicon)

const base = location.pathname.startsWith('/draw') ? '/draw' : ''
const router = createRouter({
  history: createWebHistory(base),
  routes: [
    { path: '/', component: () => import('./Home.vue') },
    { path: '/editor', name: 'editor', component: () => import('./App.vue'), beforeEnter: to => to.query.drawing ? true : { path: '/' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

createApp({ render: () => h(RouterView) }).use(router).mount('#app')
