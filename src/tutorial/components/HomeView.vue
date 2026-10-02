<template>
  <div class="home-view">
    <section v-for="category in TUTORIAL_CATEGORIES" :key="category.id" class="category-section">
      <h2 class="category-title">{{ t(category.titleKey) }}</h2>
      <div class="topic-grid">
        <a v-for="topic in category.topics" :key="topic.id" class="topic-button"
          :href="tutorialTopicUrl(category.id, topic.id)">
          <span class="topic-name">{{ t(topic.titleKey) }}</span>
          <span class="topic-desc">{{ t(topic.descKey) }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../../composables/useI18n'
import { TUTORIAL_CATEGORIES } from '../data/tutorial'
import { tutorialTopicUrl } from '../../data/toolPages'

const { t } = useI18n()
</script>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.category-title {
  margin: 0;
  font-size: 1.5rem;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.topic-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 1.5rem 1rem;
  text-decoration: none;
  color: var(--color-text-primary);
  border: 2px solid var(--color-surface-border);
  background-color: var(--color-btn-bg);
  box-shadow: 2px 2px 0 var(--color-surface-shadow);
}

.topic-button:hover {
  transform: translateY(1px);
  box-shadow: 1px 1px 0 var(--color-surface-shadow);
}

.topic-name {
  font-size: 1.4rem;
  font-weight: bold;
}

.topic-desc {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  text-align: center;
}

@media (max-width: 560px) {
  .topic-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
