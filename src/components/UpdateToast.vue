<script setup lang="ts">
/**
 * "Update available" toast (DESIGN.md §5 Toast; Plan §6.10): a new service
 * worker is waiting, and the only way it takes over is this Reload tap --
 * never mid-tap, or an in-flight event could be lost (Architecture.md §9).
 * `role="status"` so it is announced without stealing focus.
 */
import { PhArrowClockwise } from '@phosphor-icons/vue'

const emit = defineEmits<{ reload: [] }>()
</script>

<template>
  <div class="update-toast" role="status">
    <span class="update-toast__label">Update available</span>
    <button type="button" class="update-toast__action" @click="emit('reload')">
      <PhArrowClockwise :size="20" weight="regular" aria-hidden="true" />
      Reload
    </button>
  </div>
</template>

<style scoped>
.update-toast {
  position: fixed;
  right: var(--safe-right);
  bottom: calc(var(--touch) + var(--gutter) * 2 + var(--safe-bottom));
  left: var(--safe-left);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 var(--gutter);
  padding: 12px var(--card-pad);
  border-radius: var(--radius-button);
  background: var(--text);
  color: var(--bg);
  box-shadow: 0 4px 14px color-mix(in oklab, var(--text) 30%, transparent);
  font-size: var(--fs-sm);
}

.update-toast__action {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-button);
  /* Same foreground as the label: the accent on the inverted surface fails 4.5:1 in both themes. */
  color: var(--bg);
  font-weight: 600;
  transition: background-color var(--dur-press) ease-out;
}

.update-toast__action:active {
  background: color-mix(in oklab, var(--bg) 12%, transparent);
}
</style>
