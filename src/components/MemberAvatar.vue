<script setup lang="ts">
/**
 * A member's initial on their own color (DESIGN.md §5, issue #18 Today row).
 * Member colors are mid-tone by convention (docs/design/DESIGN.md §3), so a
 * fixed `--surface` initial reads clearly on any of them without a per-color
 * contrast calculation. The color itself is per-member data, not a design
 * token, so it is bound as an inline style rather than a CSS class.
 */
import { computed } from 'vue'

const props = defineProps<{
  name: string
  color: string
}>()

const initial = computed(() => props.name.trim().charAt(0).toUpperCase())
</script>

<template>
  <span class="avatar" role="img" :aria-label="name" :style="{ background: color }">
    <span aria-hidden="true">{{ initial }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-chip);
  color: var(--surface);
  font-size: var(--fs-sm);
  font-weight: 600;
}
</style>
