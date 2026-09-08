<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Icon + one sentence, with an optional one action (DESIGN.md §5 EmptyState:
 * "icon + one sentence + one action. Never a blank screen."). The icon is
 * decorative here: the sentence already carries the meaning, so the icon is
 * hidden from assistive tech rather than doubling it up with a redundant
 * aria-label. `actionLabel` is optional so the several screens that only
 * have the placeholder sentence so far (issue #15) keep working unchanged.
 */
defineProps<{
  icon: Component
  label: string
  actionLabel?: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__icon">
      <component :is="icon" :size="32" weight="regular" aria-hidden="true" />
    </span>
    <p class="empty-state__label">{{ label }}</p>
    <button v-if="actionLabel" type="button" class="empty-state__action" @click="emit('action')">
      {{ actionLabel }}
    </button>
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

.empty-state__action {
  min-height: var(--touch);
  padding: 0 calc(var(--gutter) * 1.5);
  border: none;
  border-radius: var(--radius-button);
  background: var(--primary);
  color: var(--on-primary);
  font-size: var(--fs-md);
  font-weight: 600;
  transition: transform var(--dur-press) ease-out;
}

.empty-state__action:active {
  transform: scale(0.97);
}
</style>
