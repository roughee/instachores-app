<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Icon + one sentence, no action needed yet (DESIGN.md §5 EmptyState).
 * The icon is decorative here: the sentence already carries the meaning,
 * so the icon is hidden from assistive tech rather than doubling it up
 * with a redundant aria-label.
 */
defineProps<{
  icon: Component
  label: string
}>()
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__icon">
      <component :is="icon" :size="32" weight="regular" aria-hidden="true" />
    </span>
    <p class="empty-state__label">{{ label }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--list-gap);
  min-height: 40vh;
  padding: calc(var(--gutter) * 2) var(--gutter);
  text-align: center;
}

.empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch);
  height: var(--touch);
  border-radius: var(--radius-card);
  background: var(--primary-soft);
  color: var(--primary);
}

.empty-state__label {
  max-width: 32ch;
  color: var(--text-2);
  font-size: var(--fs-md);
}
</style>
