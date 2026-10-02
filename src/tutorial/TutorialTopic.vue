<template>
  <TutorialShell wide :overview-url="overviewUrl">
    <template #default="{ isSoundEnabled, coordinateLabelMode, theme }">
      <TopicView v-if="topic && category" :topic="topic" :category="category"
        :is-sound-enabled="isSoundEnabled" :coordinate-label-mode="coordinateLabelMode" :theme="theme" />
      <div v-else class="card not-found">
        <p class="not-found-text">{{ t('tutorial.notFound') }}</p>
        <a class="btn" :href="overviewUrl">{{ t('tutorial.backToOverview') }}</a>
      </div>
    </template>
  </TutorialShell>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import TutorialShell from './TutorialShell.vue'
import TopicView from './components/TopicView.vue'
import { useI18n } from '../composables/useI18n'
import { TUTORIAL_PAGE, toolPageUrl } from '../data/toolPages'
import { findCategory, findTopic } from './data/tutorial'

interface Props {
  categoryId: string
  topicId: string
}

const props = defineProps<Props>()

const { t } = useI18n()

const overviewUrl = toolPageUrl(TUTORIAL_PAGE)

const category = computed(() => findCategory(props.categoryId))
const topic = computed(() => findTopic(props.categoryId, props.topicId))

watchEffect(() => {
  const suffix = topic.value ? ` · ${t(topic.value.titleKey)}` : ''
  document.title = `Chess Dragon · ${t('tutorial.title')}${suffix}`
})
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
}

.not-found-text {
  margin: 0;
  font-size: 0.9rem;
}
</style>
