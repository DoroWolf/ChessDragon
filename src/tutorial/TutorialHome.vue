<template>
  <TutorialShell>
    <HomeView />
  </TutorialShell>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import TutorialShell from './TutorialShell.vue'
import HomeView from './components/HomeView.vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

watchEffect(() => {
  document.title = `Chess Dragon · ${t('tutorial.title')}`
})
</script>
