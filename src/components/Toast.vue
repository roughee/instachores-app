<script setup lang="ts">
/**
 * Bottom toast with one optional action (DESIGN.md §5 Toast): auto-hides
 * after `expiresAt`, computed by the owner from the injected clock.
 * `role="status"` announces it without stealing focus. Queueing (a new
 * toast replaces the old) is the owner's job, not this component's.
 */
import { useAutoExpire } from '@/composables/useToast'

const props = defineProps<{
  message: string
  actionLabel?: string | undefined
  expiresAt: number
}>()

const emit = defineEmits<{ action: []; expire: [] }>()

useAutoExpire(
  () => props.expiresAt,
  () => emit('expire'),
)
</script>

<template>
  <div class="toast" role="status">
    <span class="toast__message">{{ message }}</span>
    <button v-if="actionLabel" type="button" class="toast__action" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.toast {
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

.toast__action {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-button);
  color: var(--bg);
  font-weight: 600;
  transition: background-color var(--dur-press) ease-out;
}

.toast__action:active {
  background: color-mix(in oklab, var(--bg) 12%, transparent);
}
</style>
