<script setup lang="ts">
/**
 * Plan §5.5 `#/today`: what happened today, grouped by hour, newest first.
 * Rows come straight from `eventsStore.todayRows` (`src/domain/today.ts`),
 * the same domain-derived state the Log screen's household bar reads, so the
 * two screens can never disagree on a total. A row from a partner's poll
 * (issue #14) lands in `todayRows` through ordinary reactivity -- the
 * `TransitionGroup` below is what turns that into the 200ms slide, gated by
 * `--dur-sheet` (zeroed under reduced motion in tokens.css, DESIGN.md §4).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PhClockCounterClockwise } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import HourGroup from '@/components/HourGroup.vue'
import TodayRow from '@/components/TodayRow.vue'
import { localParts } from '@/domain/time'
import type { TodayRow as TodayRowT } from '@/domain/today'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'

type FlatItem = { kind: 'header'; key: string; hourKey: string } | { kind: 'row'; key: string; row: TodayRowT }

const router = useRouter()
const eventsStore = useEventsStore()
const householdStore = useHouseholdStore()

function memberName(uid: string): string {
  return householdStore.household?.members[uid]?.name ?? 'Someone'
}

function memberColor(uid: string): string {
  return householdStore.household?.members[uid]?.color ?? '#6b6f7a'
}

function timeLabel(at: Date): string {
  const tz = householdStore.household?.tz ?? 'UTC'
  const p = localParts(at, tz)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

const items = computed<FlatItem[]>(() => {
  const out: FlatItem[] = []
  let currentHour: string | undefined
  for (const row of eventsStore.todayRows) {
    if (row.hourKey !== currentHour) {
      currentHour = row.hourKey
      out.push({ kind: 'header', key: `hour-${row.hourKey}-${row.eventId}`, hourKey: row.hourKey })
    }
    out.push({ kind: 'row', key: row.eventId, row })
  }
  return out
})

function goToLog(): void {
  void router.push('/log')
}
</script>

<template>
  <div class="today-screen">
    <EmptyState
      v-if="eventsStore.todayRows.length === 0"
      :icon="PhClockCounterClockwise"
      label="Quiet so far"
      action-label="Log a task"
      @action="goToLog"
    />
    <TransitionGroup v-else tag="div" name="row" class="today-screen__list">
      <template v-for="item in items" :key="item.key">
        <HourGroup v-if="item.kind === 'header'" :hour-key="item.hourKey" />
        <TodayRow
          v-else
          :row="item.row"
          :member-name="memberName(item.row.forUid)"
          :member-color="memberColor(item.row.forUid)"
          :time-label="timeLabel(item.row.at)"
        />
      </template>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.today-screen {
  padding: var(--gutter);
}

.today-screen__list {
  display: flex;
  flex-direction: column;
}

.row-enter-active,
.row-leave-active {
  transition:
    transform var(--dur-sheet) ease-out,
    opacity var(--dur-sheet) ease-out;
}

.row-enter-from {
  transform: translateY(-12px);
  opacity: 0;
}

.row-leave-to {
  opacity: 0;
}

.row-leave-active {
  position: absolute;
}
</style>
