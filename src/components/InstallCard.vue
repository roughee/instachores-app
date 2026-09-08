<script setup lang="ts">
/**
 * One-time "Add to home screen" card (Plan §6.10, Settings screen). Shown
 * only while `usePwa().showInstallCard` is true: not already standalone, a
 * `beforeinstallprompt` was captured, and the card was not dismissed before.
 */
import { PhDeviceMobile } from '@phosphor-icons/vue'

const emit = defineEmits<{ install: []; dismiss: [] }>()
</script>

<template>
  <section class="install-card">
    <span class="install-card__icon">
      <PhDeviceMobile :size="24" weight="regular" aria-hidden="true" />
    </span>
    <p class="install-card__label">Add HomeCrew to your home screen</p>
    <div class="install-card__actions">
      <button
        type="button"
        class="install-card__button install-card__button--dismiss"
        data-test="install-card-dismiss"
        @click="emit('dismiss')"
      >
        Not now
      </button>
      <button
        type="button"
        class="install-card__button install-card__button--add"
        data-test="install-card-add"
        @click="emit('install')"
      >
        Add
      </button>
    </div>
  </section>
</template>

<style scoped>
.install-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--list-gap);
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
  text-align: center;
}

.install-card__icon {
  display: inline-flex;
  width: var(--touch);
  height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
  background: var(--primary-soft);
  color: var(--primary);
}

.install-card__label {
  max-width: 32ch;
  color: var(--text);
  font-size: var(--fs-md);
}

.install-card__actions {
  display: flex;
  width: 100%;
  gap: var(--list-gap);
}

.install-card__button {
  flex: 1;
  min-height: var(--touch);
  border: none;
  border-radius: var(--radius-button);
  font-size: var(--fs-md);
  font-weight: 600;
  transition: transform var(--dur-press) ease-out;
}

.install-card__button:active {
  transform: scale(0.97);
}

.install-card__button--dismiss {
  background: var(--surface-2);
  color: var(--text-2);
}

.install-card__button--add {
  background: var(--primary);
  color: var(--on-primary);
}
</style>
