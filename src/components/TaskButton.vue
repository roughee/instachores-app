<script setup lang="ts">
/**
 * Full-width task button (DESIGN.md §5): icon, name, points chip, and
 * today's avatars. Long-press options (log for partner, backdate, note)
 * are a later ticket; this only wires the two-tap complete.
 *
 * `subline` and `due` (issue #70, Plan §5.5 "States"): a listed task with a
 * last completion shows the subline alone; a due task adds the Due chip
 * between the text column and the points. Neither prop changes anything
 * when omitted -- the plain single-line layout from before this ticket.
 * Copy for both comes from `src/domain/scheduleCopy.ts`, not from here.
 */
import { computed } from 'vue'
import type { Member, Task } from '@/schemas'
import { categoryIcon } from './categoryIcons'

const props = defineProps<{
  task: Task
  doneBy: Member[]
  subline?: string
  due?: string
}>()

const emit = defineEmits<{ complete: [] }>()

const icon = computed(() => categoryIcon(props.task.category))
</script>

<template>
  <button
    type="button"
    class="task-button"
    :class="{ 'task-button--with-subline': subline }"
    data-test="task-button"
    @click="emit('complete')"
  >
    <span class="task-button__icon">
      <component :is="icon" :size="24" weight="regular" aria-hidden="true" />
    </span>
    <span v-if="subline" class="task-button__text">
      <span class="task-button__name">{{ task.name }}</span>
      <span class="task-button__subline">{{ subline }}</span>
    </span>
    <span v-else class="task-button__name">{{ task.name }}</span>
    <span v-if="due" class="task-button__due">{{ due }}</span>
    <span class="task-button__points tabular-nums">+{{ task.points }}</span>
    <span v-if="doneBy.length > 0" class="task-button__avatars">
      <span
        v-for="m in doneBy"
        :key="m.uid"
        class="task-button__avatar"
        :style="{ background: m.color }"
        :aria-label="m.name"
      >
        {{ m.name.charAt(0) }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.task-button {
  display: flex;
  min-height: 56px;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 0 var(--card-pad);
  border: none;
  border-radius: var(--radius-button);
  background: var(--surface);
  text-align: left;
  transition: background-color var(--dur-press) ease-out;
}

.task-button:active {
  background: var(--surface-2);
}

.task-button__icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  background: var(--primary-soft);
  color: var(--primary);
}

.task-button--with-subline {
  padding: 8px var(--card-pad);
}

.task-button__name {
  flex: 1;
  color: var(--text);
  font-size: var(--fs-md);
}

.task-button__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.task-button__text .task-button__name {
  flex: initial;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.task-button__subline {
  overflow: hidden;
  color: var(--text-2);
  font-size: var(--fs-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.task-button__due {
  display: inline-flex;
  flex-shrink: 0;
  height: 24px;
  align-items: center;
  padding: 0 8px;
  border-radius: var(--radius-chip);
  background: color-mix(in oklab, var(--warn) 14%, var(--surface));
  color: var(--warn);
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
}

.task-button__points {
  color: var(--points);
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.task-button__avatars {
  display: flex;
}

.task-button__avatar {
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
  border: 2px solid var(--surface);
  border-radius: var(--radius-chip);
  color: var(--on-primary);
  font-size: 10px;
  font-weight: 600;
}
</style>
