<script setup lang="ts">
/**
 * A row on the Schedule tab (DESIGN.md §5 ScheduleRow, issue #71): category
 * icon tile, task name over its subline, points, and a chip -- "Due" (warn
 * tint) for the Today group, otherwise the day it comes back (plain
 * surface tint). Every prop is already-formatted data from
 * `src/domain/scheduleView.ts`; this component only lays it out and emits
 * `complete` on tap, same two-tap contract as `TaskButton`. Tapping
 * completes the task and opens "Next time?" -- `ScheduleScreen.vue`'s job,
 * not this component's.
 */
import { computed } from 'vue'
import type { Category } from '@/schemas'
import { categoryIcon } from './categoryIcons'

const props = defineProps<{
  category: Category
  name: string
  points: number
  subline: string
  chipLabel: string
  chipVariant: 'due' | 'day'
}>()

const emit = defineEmits<{ complete: [] }>()

const icon = computed(() => categoryIcon(props.category))
</script>

<template>
  <button
    type="button"
    class="schedule-row"
    :class="`schedule-row--${category}`"
    data-test="schedule-row"
    @click="emit('complete')"
  >
    <span class="schedule-row__icon">
      <component :is="icon" :size="24" weight="regular" aria-hidden="true" />
    </span>
    <span class="schedule-row__text">
      <span class="schedule-row__name">{{ name }}</span>
      <span class="schedule-row__subline">{{ subline }}</span>
    </span>
    <span class="schedule-row__points tabular-nums">+{{ points }}</span>
    <span
      class="schedule-row__chip"
      :class="{ 'schedule-row__chip--due': chipVariant === 'due' }"
      data-test="schedule-row-chip"
    >
      {{ chipLabel }}
    </span>
  </button>
</template>

<style scoped>
.schedule-row {
  display: flex;
  min-height: 56px;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 8px var(--card-pad);
  border: none;
  border-radius: var(--radius-button);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  transition: background-color var(--dur-press) ease-out;
}

.schedule-row:active {
  background: var(--surface-2);
}

.schedule-row__icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
}

.schedule-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.schedule-row__name {
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-md);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.schedule-row__subline {
  overflow: hidden;
  color: var(--text-2);
  font-size: var(--fs-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.schedule-row__points {
  flex-shrink: 0;
  color: var(--points);
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.schedule-row__chip {
  display: inline-flex;
  flex-shrink: 0;
  height: 24px;
  align-items: center;
  padding: 0 8px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
}

.schedule-row__chip--due {
  background: color-mix(in oklab, var(--warn) 14%, var(--surface));
  color: var(--warn);
}

.schedule-row--kitchen .schedule-row__icon {
  background: var(--cat-kitchen-soft);
  color: var(--cat-kitchen);
}

.schedule-row--laundry .schedule-row__icon {
  background: var(--cat-laundry-soft);
  color: var(--cat-laundry);
}

.schedule-row--floors .schedule-row__icon {
  background: var(--cat-floors-soft);
  color: var(--cat-floors);
}

.schedule-row--bathroom .schedule-row__icon {
  background: var(--cat-bathroom-soft);
  color: var(--cat-bathroom);
}

.schedule-row--kids .schedule-row__icon {
  background: var(--cat-kids-soft);
  color: var(--cat-kids);
}

.schedule-row--home .schedule-row__icon {
  background: var(--cat-home-soft);
  color: var(--cat-home);
}

.schedule-row--admin .schedule-row__icon {
  background: var(--cat-admin-soft);
  color: var(--cat-admin);
}

.schedule-row--car .schedule-row__icon {
  background: var(--cat-car-soft);
  color: var(--cat-car);
}
</style>
