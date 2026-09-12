<script setup lang="ts">
/**
 * One row in the Schedule tab's "Recently done" card (DESIGN.md §5, issue
 * #71): who did it (`MemberAvatar`), the task name over a formatted
 * timestamp, and on the right when it comes back. All copy is
 * pre-formatted by `src/domain/scheduleView.ts` -- this component only
 * lays it out, same split as `TodayRow.vue`.
 */
import { PhCalendarBlank } from '@phosphor-icons/vue'
import MemberAvatar from './MemberAvatar.vue'

defineProps<{
  name: string
  memberName: string
  memberColor: string
  /** "Today, 08:15" / "Yesterday, 19:40" / "Thu, 21:05". */
  timeLabel: string
  /** "back in N days" / "back tomorrow" / "back today" / "not scheduled". */
  backLabel: string
}>()
</script>

<template>
  <div class="recent-done-row">
    <MemberAvatar :name="memberName" :color="memberColor" />
    <div class="recent-done-row__text">
      <p class="recent-done-row__name">{{ name }}</p>
      <p class="recent-done-row__time">{{ timeLabel }}</p>
    </div>
    <span class="recent-done-row__back">
      <PhCalendarBlank :size="16" weight="regular" aria-hidden="true" />
      {{ backLabel }}
    </span>
  </div>
</template>

<style scoped>
.recent-done-row {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.recent-done-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.recent-done-row__name {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: var(--fs-md);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.recent-done-row__time {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-xs);
}

.recent-done-row__back {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
</style>
