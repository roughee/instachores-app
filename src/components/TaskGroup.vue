<script setup lang="ts">
/**
 * Group task card (DESIGN.md §5, Plan §3): a parent (Hand-wash dishes, Clean
 * bathroom) with its active sub-items as chips. A chip tap logs that
 * sub-item alone; tapping the same chip again logs a second time and the
 * chip shows a count badge (>= 2 completions today by anyone, per
 * `doneTodayByTask`). "Do all" logs every active sub-item; when the parent
 * carries a `comboBonus`, `eventsStore.completeMany` appends the bonus once
 * (its deterministic id makes a same-day repeat a no-op for the bonus).
 * Archived sub-items never render, so an archived child is invisible here
 * and excluded from "Do all".
 */
import { computed } from 'vue'
import type { Task } from '@/schemas'
import { categoryIcon } from './categoryIcons'

const props = defineProps<{
  parent: Task
  children: Task[]
  doneTodayByTask: Map<string, string[]>
}>()

const emit = defineEmits<{ complete: [taskId: string]; completeAll: [taskIds: string[]] }>()

const icon = computed(() => categoryIcon(props.parent.category))

const activeChildren = computed(() => props.children.filter((c) => !c.archived).sort((a, b) => a.sort - b.sort))

/** Every active child's points plus the parent's bonus, if any: what "Do all" is worth. */
const totalPoints = computed(
  () => activeChildren.value.reduce((sum, c) => sum + c.points, 0) + (props.parent.comboBonus ?? 0),
)

function countToday(taskId: string): number {
  return props.doneTodayByTask.get(taskId)?.length ?? 0
}

function onDoAll(): void {
  emit(
    'completeAll',
    activeChildren.value.map((c) => c.id),
  )
}
</script>

<template>
  <section class="task-group" :aria-label="parent.name">
    <div class="task-group__header">
      <span class="task-group__icon">
        <component :is="icon" :size="24" weight="regular" aria-hidden="true" />
      </span>
      <span class="task-group__name">{{ parent.name }}</span>
      <span class="task-group__hint tabular-nums">+{{ totalPoints }}</span>
    </div>

    <div class="task-group__chips">
      <button
        v-for="c in activeChildren"
        :key="c.id"
        type="button"
        class="task-group__chip"
        data-test="task-group-chip"
        @click="emit('complete', c.id)"
      >
        <span class="task-group__chip-name">{{ c.name }}</span>
        <span v-if="countToday(c.id) >= 2" class="task-group__chip-badge">x{{ countToday(c.id) }}</span>
      </button>
    </div>

    <button type="button" class="task-group__do-all" data-test="task-group-do-all" @click="onDoAll">Do all</button>
  </section>
</template>

<style scoped>
.task-group {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.task-group__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-group__icon {
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

.task-group__name {
  flex: 1;
  color: var(--text);
  font-size: var(--fs-md);
  font-weight: 600;
}

.task-group__hint {
  color: var(--points);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.task-group__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-group__chip {
  display: inline-flex;
  min-height: var(--touch);
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-sm);
  transition: background-color var(--dur-press) ease-out;
}

.task-group__chip:active {
  background: var(--primary-soft);
}

.task-group__chip-badge {
  color: var(--points);
  font-weight: 700;
}

.task-group__do-all {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-button);
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
  transition: background-color var(--dur-press) ease-out;
}

.task-group__do-all:active {
  background: var(--primary-soft);
  color: var(--primary);
}
</style>
