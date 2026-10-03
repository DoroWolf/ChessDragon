<template>
  <section class="tutorial-container">
    <div class="top-left-fabs">
      <a v-if="overviewUrl" class="fab-btn" :href="overviewUrl" :title="t('tutorial.backToOverview')">
        <span class="fab-icon" v-html="tutorialSvg"></span>
      </a>
      <a class="fab-btn" :href="editorUrl" target="_blank" rel="noopener" :title="t('app.editor')">
        <span class="fab-icon" v-html="editorSvg"></span>
      </a>
    </div>

    <div class="top-right-fabs">
      <a href="https://github.com/DoroWolf/ChessDragon" target="_blank" rel="noopener" class="fab-btn"
        title="GitHub">
        <span class="fab-icon" v-html="githubSvg"></span>
      </a>
      <button type="button" class="fab-btn" :title="t('app.settings')" @click="showSettingsModal = true">
        <span class="fab-icon" v-html="settingSvg"></span>
      </button>
    </div>

    <main class="tutorial-main" :class="{ 'tutorial-main-wide': wide }">
      <slot :isSoundEnabled="isSoundEnabled" :coordinateLabelMode="coordinateLabelMode" :theme="theme" />
    </main>

    <SettingsModal :visible="showSettingsModal" :is-sound-enabled="isSoundEnabled"
      :coordinate-label-mode="coordinateLabelMode" :theme="theme" @close="showSettingsModal = false"
      @update:is-sound-enabled="(val: boolean) => isSoundEnabled = val"
      @update:coordinate-label-mode="(val: 'off' | 'inside' | 'outside') => coordinateLabelMode = val"
      @update:theme="(val: 'light' | 'dark') => theme = val" />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SettingsModal from '../components/SettingsModal.vue'
import { useI18n } from '../composables/useI18n'
import { useSettings } from '../composables/useSettings'
import { EDITOR_PAGE, toolPageUrl } from '../data/toolPages'
import githubSvg from '../assets/icon/github.svg?raw'
import tutorialSvg from '../assets/icon/openedBook.svg?raw'
import settingSvg from '../assets/icon/setting.svg?raw'
import editorSvg from '../assets/icon/custom.svg?raw'

interface Props {
  /** 专题页是「左棋盘 + 右信息」，需要更宽的容器 */
  wide?: boolean
  overviewUrl?: string | null
}

withDefaults(defineProps<Props>(), {
  wide: false,
  overviewUrl: null,
})

defineSlots<{
  default(props: {
    isSoundEnabled: boolean
    coordinateLabelMode: 'off' | 'inside' | 'outside'
    theme: 'light' | 'dark'
  }): unknown
}>()

const { t } = useI18n()

const { isSoundEnabled, coordinateLabelMode, theme } = useSettings()

const editorUrl = toolPageUrl(EDITOR_PAGE)

const showSettingsModal = ref(false)
</script>

<style scoped>
.tutorial-container {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 20px;
  padding-top: 60px;
  font-family: 'Unifont', system-ui, -apple-system, sans-serif;
  color: var(--color-text-primary);
}

.top-left-fabs,
.top-right-fabs {
  position: absolute;
  top: 16px;
  z-index: 10000;
  display: flex;
  gap: 10px;
}

.top-left-fabs {
  left: 16px;
}

.top-right-fabs {
  right: 16px;
}

.fab-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 1.4rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.15s, color 0.15s;
  text-decoration: none;
}

.fab-btn:hover .fab-icon :deep(svg) {
  opacity: 0.8;
}

.fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.fab-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.tutorial-main {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding-bottom: 2rem;
}

.tutorial-main-wide {
  max-width: 1280px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
