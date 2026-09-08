<script setup lang="ts">
/**
 * The hour heading on the Today screen's list (Plan §5.5 `#/today`, issue
 * #18): "21:00" in tabular figures so a scanning eye can line up the digits
 * down the column.
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Two-digit local hour, e.g. '21'. */
  hourKey: string
}>()

const label = computed(() => `${props.hourKey}:00`)
</script>

<template>
  <h2 class="hour-group tabular-nums">{{ label }}</h2>
</template>

<style scoped>
.hour-group {
  margin: 0;
  padding: var(--list-gap) 0;
  color: var(--text-2);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
}
</style>
