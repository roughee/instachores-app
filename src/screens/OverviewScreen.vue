<script setup lang="ts">
import { PhChartBar } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <EmptyState :icon="PhChartBar" label="Review the week and month once there is data to show." />
</template>
