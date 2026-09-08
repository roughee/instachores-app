<script setup lang="ts">
/**
 * Left/right arrows through past weeks on the Overview screen (DESIGN.md
 * §5, Plan §5.5 `#/overview`, issue #19). The label reads `localParts` on
 * `start` and the last instant before `end` so it never depends on the
 * wall clock; "next" is disabled by the caller once there is no later
 * week to page to (`weekOffset` back at 0 in `stores/events.ts`).
 */
import { computed } from 'vue'
import { PhCaretLeft, PhCaretRight } from '@phosphor-icons/vue'
import { localParts } from '@/domain/time'

const props = defineProps<{
  /** Monday 00:00 household-local. */
  start: Date
  /** The following Monday 00:00 household-local (exclusive). */
  end: Date
  tz: string
  nextDisabled: boolean
}>()

const emit = defineEmits<{ prev: []; next: [] }>()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const label = computed(() => {
  const from = localParts(props.start, props.tz)
  const to = localParts(new Date(props.end.getTime() - 1), props.tz)
  if (from.month === to.month) return `${from.day} to ${to.day} ${MONTHS[to.month - 1]}`
  return `${from.day} ${MONTHS[from.month - 1]} to ${to.day} ${MONTHS[to.month - 1]}`
})
</script>

<template>
  <nav class="week-nav" aria-label="Week navigation">
    <button type="button" class="week-nav__button" aria-label="Previous week" @click="emit('prev')">
      <PhCaretLeft :size="20" weight="regular" aria-hidden="true" />
    </button>
    <span class="week-nav__label">{{ label }}</span>
    <button
      type="button"
      class="week-nav__button"
      aria-label="Next week"
      :disabled="nextDisabled"
      @click="emit('next')"
    >
      <PhCaretRight :size="20" weight="regular" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--list-gap);
}

.week-nav__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch);
  height: var(--touch);
  border-radius: var(--radius-button);
  color: var(--text);
  transition: transform var(--dur-press) ease-out;
}

.week-nav__button:active {
  transform: scale(0.94);
}

.week-nav__button:disabled {
  color: var(--text-2);
  cursor: default;
}

.week-nav__label {
  font-family: var(--font-display);
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text);
}
</style>
