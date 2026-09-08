<script setup lang="ts">
import { PhListChecks } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
</script>

<template>
  <EmptyState :icon="PhListChecks" label="Log a task in two taps once tasks are loaded." />
</template>
