<script setup lang="ts">
/**
 * Three learned tasks (DESIGN.md §5, Plan §5.5): defaults to the seeded
 * pots/counters/trash until 14 days of history teach better ones
 * (`domain/derive.ts`'s `quickRow`). Presentational: it renders
 * `TaskButton`s and bubbles the tapped task's id, nothing else.
 */
import type { Member, Task } from '@/schemas'
import TaskButton from './TaskButton.vue'

defineProps<{
  tasks: Task[]
  doneTodayByTask: Map<string, Member[]>
}>()

const emit = defineEmits<{ complete: [taskId: string] }>()
</script>

<template>
  <section class="quick-row" aria-label="Quick tasks">
    <TaskButton
      v-for="t in tasks"
      :key="t.id"
      :task="t"
      :done-by="doneTodayByTask.get(t.id) ?? []"
      @complete="emit('complete', t.id)"
    />
  </section>
</template>

<style scoped>
.quick-row {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
}
</style>
