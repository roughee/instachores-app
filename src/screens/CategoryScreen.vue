<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { PhTag } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const category = computed(() => {
  const raw = route.params.category
  return typeof raw === 'string' ? raw : ''
})
const label = computed(() =>
  category.value
    ? `Tasks for ${category.value} are coming soon.`
    : 'Tasks for this category are coming soon.',
)
</script>

<template>
  <EmptyState :icon="PhTag" :label="label" />
</template>
