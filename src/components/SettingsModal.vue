<template>
  <div v-if="visible" class="modal-backdrop">
    <div class="card dialog-box settings-dialog">
      <p class="dialog-title">游戏设置</p>

      <div class="settings-list">
        <!-- 音效开关 -->
        <div class="setting-item">
          <span class="setting-label">音效</span>
          <label class="checkbox-label">
            <input type="checkbox" class="custom-checkbox" :checked="isSoundEnabled" @change="handleSoundChange" />
          </label>
        </div>

        <!-- 棋盘坐标标记 -->
        <div class="setting-item">
          <span class="setting-label">棋盘标志</span>
          <div class="select-wrapper">
            <select :value="coordinateLabelMode" @change="handleCoordinateChange" class="custom-select">
              <option value="off">关闭</option>
              <option value="inside">内侧</option>
              <option value="outside">外侧</option>
            </select>
          </div>
        </div>
      </div>

      <div class="dialog-buttons">
        <button type="button" class="btn" @click="$emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean
  isSoundEnabled: boolean
  coordinateLabelMode: 'off' | 'inside' | 'outside'
}

defineProps<Props>()

const emit = defineEmits<{
  close: []
  'toggle-flip': []
  'update:isSoundEnabled': [value: boolean]
  'update:coordinateLabelMode': [value: 'off' | 'inside' | 'outside']
}>()

const handleSoundChange = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  emit('update:isSoundEnabled', checked)
}

const handleCoordinateChange = (e: Event) => {
  const value = (e.target as HTMLSelectElement).value as 'off' | 'inside' | 'outside'
  emit('update:coordinateLabelMode', value)
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.settings-dialog {
  background: white;
  padding: 1.5rem;
  max-width: 280px;
  width: 90%;
  text-align: center;
}

.dialog-title {
  font-weight: bold;
  margin-bottom: 0.75rem;
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

.flip-btn {
  font-size: 0.7rem;
  padding: 2px 8px;
}

.custom-checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

.select-wrapper {
  width: auto;
}

.custom-select {
  cursor: pointer;
  font-family: 'Unifont', system-ui, -apple-system, sans-serif;
  font-size: 0.75rem;
  padding: 2px 8px;
  border: 2px solid #212529;
  background-color: #fff;
}
</style>