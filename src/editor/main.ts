import { createApp } from 'vue'
import BoardEditor from './BoardEditor.vue'
import { i18n } from '../i18n'
import '../assets/styles.css'

createApp(BoardEditor).use(i18n).mount('#app')
