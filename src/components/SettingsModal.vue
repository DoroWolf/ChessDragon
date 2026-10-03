<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="card dialog-box settings-dialog">
      <p class="dialog-title">{{ t('settings.title') }}</p>

      <div class="settings-list">
        <!-- 音效开关 -->
        <div class="setting-item">
          <span class="setting-label">{{ t('settings.sound') }}</span>
          <label class="checkbox-label">
            <input
              type="checkbox"
              class="custom-checkbox"
              :checked="isSoundEnabled"
              @change="handleSoundChange"
            />
          </label>
        </div>

        <!-- 棋盘坐标标记 -->
        <div class="setting-item">
          <span class="setting-label">{{ t('settings.boardLabels') }}</span>
          <div class="select-wrapper">
            <select
              :value="coordinateLabelMode"
              @change="handleCoordinateChange"
              class="custom-select"
            >
              <option value="off">{{ t('settings.labelsOff') }}</option>
              <option value="inside">{{ t('settings.labelsInside') }}</option>
              <option value="outside">{{ t('settings.labelsOutside') }}</option>
            </select>
          </div>
        </div>

        <!-- 主题 -->
        <div class="setting-item">
          <span class="setting-label">{{ t('settings.theme') }}</span>
          <div class="select-wrapper">
            <select :value="theme" @change="handleThemeChange" class="custom-select">
              <option value="light">{{ t('settings.themeLight') }}</option>
              <option value="dark">{{ t('settings.themeDark') }}</option>
            </select>
          </div>
        </div>

        <!-- 语言 -->
        <div class="setting-item">
          <span class="setting-label">{{ t('settings.language') }}</span>
          <div class="select-wrapper">
            <select :value="locale" @change="handleLocaleChange" class="custom-select">
              <option value="zh-CN">{{ t('settings.langZh') }}</option>
              <option value="en-US">{{ t('settings.langEn') }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="dialog-buttons">
        <button type="button" class="btn" @click="$emit('close')">{{ t('common.done') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../composables/useI18n'
import type { Locale } from '../data/i18n'

interface Props {
  visible: boolean
  isSoundEnabled: boolean
  coordinateLabelMode: 'off' | 'inside' | 'outside'
  theme: 'light' | 'dark'
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
  'toggle-flip': []
  'update:isSoundEnabled': [value: boolean]
  'update:coordinateLabelMode': [value: 'off' | 'inside' | 'outside']
  'update:theme': [value: 'light' | 'dark']
}>()

const { locale, t } = useI18n()

const handleSoundChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  emit('update:isSoundEnabled', checked)
}

const handleCoordinateChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value as 'off' | 'inside' | 'outside'
  emit('update:coordinateLabelMode', value)
}

const handleThemeChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value as 'light' | 'dark'
  emit('update:theme', value)
}

const handleLocaleChange = (e: Event) => {
  locale.value = (e.target as HTMLSelectElement).value as Locale
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay-heavy);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.settings-dialog {
  background: var(--color-surface);
  padding: 1.5rem;
  max-width: 280px;
  width: 90%;
  text-align: center;
  box-shadow: none;
}

.dialog-title {
  font-weight: bold;
  margin-bottom: 1rem;
}

.dialog-buttons {
  display: flex;
  justify-content: space-around;
  gap: 0.5rem;
}

.dialog-buttons .btn {
  flex: 1;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
  text-align: left;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.setting-label {
  font-weight: bold;
}

.custom-checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.select-wrapper {
  width: auto;
}
</style>
