<script setup lang="ts">
import { PhClockCounterClockwise } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <EmptyState :icon="PhClockCounterClockwise" label="See what happened today once someone logs a task." />
</template>
