<script setup lang="ts">
/**
 * A generic section header for the Schedule tab (DESIGN.md §5, issue #71):
 * same look as `HourGroup.vue`'s hour heading, but for a plain label
 * ("Today", "Tomorrow", "This week", "Later", "Recently done") instead of
 * an hour -- reusing `HourGroup` itself would misuse its `hourKey` prop for
 * text it was never meant to format.
 */
defineProps<{
  label: string
}>()
</script>

<template>
  <h2 class="day-header">{{ label }}</h2>
</template>

<style scoped>
.day-header {
  margin: 0;
  padding: var(--list-gap) 0;
  color: var(--text-2);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
}
</style>
