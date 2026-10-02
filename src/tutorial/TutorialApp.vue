<template>
  <TutorialTopic v-if="topicId" :category-id="categoryId" :topic-id="topicId" />
  <TutorialHome v-else />
</template>

<script setup lang="ts">
import TutorialHome from './TutorialHome.vue'
import TutorialTopic from './TutorialTopic.vue'

const params = new URLSearchParams(window.location.search)
const categoryId = params.get('category') ?? ''
const topicId = params.get('topic') ?? ''
</script>
