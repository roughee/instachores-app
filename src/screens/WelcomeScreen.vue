<script setup lang="ts">
import { PhDoorOpen } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <EmptyState :icon="PhDoorOpen" label="Connect your household to start logging chores." />
</template>
