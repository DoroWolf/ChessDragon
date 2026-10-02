import { createApp } from 'vue'
import TutorialApp from './TutorialApp.vue'
import { i18n } from '../i18n'
import '../assets/styles.css'

createApp(TutorialApp).use(i18n).mount('#app')
