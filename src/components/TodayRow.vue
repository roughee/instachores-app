<script setup lang="ts">
/**
 * One row on the Today screen (Plan §5.5 `#/today`, issue #18): avatar, task
 * name, points and time. `row.undone` (an event cancelled by an undo in the
 * last 24h, `src/domain/today.ts`) strikes the row through rather than
 * hiding it -- Plan §5.5: "Undone events shown struck-through for 24 h."
 */
import MemberAvatar from '@/components/MemberAvatar.vue'
import type { TodayRow as TodayRowT } from '@/domain/today'

defineProps<{
  row: TodayRowT
  memberName: string
  memberColor: string
  /** Pre-formatted 'HH:MM' in the household tz; kept dumb here on purpose. */
  timeLabel: string
}>()
</script>

<template>
  <div class="today-row" :class="{ 'today-row--undone': row.undone }">
    <MemberAvatar :name="memberName" :color="memberColor" />
    <div class="today-row__body">
      <p class="today-row__task">{{ row.taskName }}</p>
      <p class="today-row__time tabular-nums">{{ timeLabel }}</p>
    </div>
    <span class="today-row__points tabular-nums">+{{ row.points }}</span>
  </div>
</template>

<style scoped>
.today-row {
  display: flex;
  align-items: center;
  gap: var(--list-gap);
  min-height: var(--touch);
  padding: 8px 0;
}

.today-row__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.today-row__task {
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.today-row__time {
  color: var(--text-2);
  font-size: var(--fs-xs);
}

.today-row__points {
  color: var(--points);
  font-size: var(--fs-md);
  font-weight: 600;
}

.today-row--undone .today-row__task,
.today-row--undone .today-row__points {
  color: var(--text-2);
  text-decoration: line-through;
}
</style>
