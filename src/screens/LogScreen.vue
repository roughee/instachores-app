<script setup lang="ts">
/**
 * Log (home), Plan §5.5, DESIGN.md §5: household bar, "You today", the
 * three-task quick row, then the category grid. A quick-row tap logs the
 * task immediately (haptic tick); the household bar reflects it in the
 * same frame because `eventsStore.complete` applies locally before its
 * repo write resolves (Architecture.md §2). The "Next time?" sheet (issue
 * #69) opens right after (whether or not the task has a suggested
 * interval; `useNextTimeSheet.open` itself skips kid tasks) -- the toast
 * with Undo is queued rather than shown immediately so its 4s window
 * starts when the sheet closes, not when the completion happened.
 */
import { computed } from 'vue'
import { PhListChecks } from '@phosphor-icons/vue'
import CategoryTile from '@/components/CategoryTile.vue'
import EmptyState from '@/components/EmptyState.vue'
import HouseholdBar from '@/components/HouseholdBar.vue'
import NextTimeSheet from '@/components/NextTimeSheet.vue'
import QuickRow from '@/components/QuickRow.vue'
import Toast from '@/components/Toast.vue'
import { categoryColor, categoryIcon, categoryLabel, GRID_CATEGORIES } from '@/components/categoryIcons'
import { useCelebration } from '@/composables/useCelebration'
import { useHaptic } from '@/composables/useHaptic'
import { useNextTimeSheet } from '@/composables/useNextTimeSheet'
import { useToast } from '@/composables/useToast'
import type { ShowToastOptions } from '@/composables/useToast'
import type { Category, Member, Task } from '@/schemas'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { useSyncStore } from '@/stores/sync'

const householdStore = useHouseholdStore()
const catalogStore = useCatalogStore()
const eventsStore = useEventsStore()
const syncStore = useSyncStore()
const { tick } = useHaptic()
const { toast, show, dismiss } = useToast()
const { trigger: triggerCelebration } = useCelebration()
const nextTimeSheet = useNextTimeSheet()

/** `eventsStore.doneTodayByTask` gives uids; the components below want the
 * `Member` for each, so this is the one place that resolves them. */
const doneTodayByTaskMembers = computed<Map<string, Member[]>>(() => {
  const map = new Map<string, Member[]>()
  const members = householdStore.household?.members
  if (!members) return map
  for (const [taskId, uids] of eventsStore.doneTodayByTask) {
    map.set(
      taskId,
      uids.map((uid) => members[uid]).filter((m): m is Member => Boolean(m)),
    )
  }
  return map
})

function doneTodayInCategory(category: Category): number {
  const tasks = catalogStore.byCategory.get(category) ?? []
  let total = 0
  for (const t of tasks) total += eventsStore.doneTodayByTask.get(t.id)?.length ?? 0
  return total
}

/** Toast queued behind an open Next time sheet (issue #69): `show()` is
 * deferred so `TOAST_DURATION_MS` starts counting down from the sheet's
 * close, not from the completion itself. */
let pendingToast: ShowToastOptions | undefined

function flushPendingToast(): void {
  if (!pendingToast) return
  show(pendingToast)
  pendingToast = undefined
}

/** Opens the Next time sheet for `task`'s just-created `complete` event
 * (`eventId`), if the household is loaded and the event is still live;
 * `nextTimeSheet.open` itself skips kid tasks. Returns whether it opened,
 * so the caller knows whether to defer its toast. */
function openSheetFor(task: Task | undefined, eventId: string | undefined, lastDoneAt: Date | undefined): boolean {
  const household = householdStore.household
  if (!task || !eventId || !household) return false
  const event = eventsStore.events.find((e) => e.id === eventId)
  if (!event || event.type !== 'complete') return false
  nextTimeSheet.open({
    task,
    completeEventId: eventId,
    points: event.points,
    memberName: householdStore.currentMember?.name ?? '',
    lastDoneAt,
    completedAt: event.at,
    tz: household.tz,
    categoryLabel: categoryLabel(task.category),
  })
  return nextTimeSheet.payload.value !== undefined
}

async function onQuickComplete(taskId: string): Promise<void> {
  const task = catalogStore.byId.get(taskId)
  tick()
  const lastDoneAt = task ? eventsStore.schedule.get(taskId)?.lastDoneAt : undefined
  const pending = eventsStore.complete(taskId)
  triggerCelebration(categoryColor(task?.category))
  const eventId = eventsStore.recentlyLogged?.eventId
  const toastOptions: ShowToastOptions = {
    message: task ? `${task.name} logged` : 'Task logged',
    action: eventId ? { label: 'Undo', onAction: () => eventsStore.undo(eventId) } : undefined,
  }
  if (openSheetFor(task, eventId, lastDoneAt)) pendingToast = toastOptions
  else show(toastOptions)
  await pending
}

function onSheetSchedule(days: number): void {
  const completeEventId = nextTimeSheet.payload.value?.completeEventId
  nextTimeSheet.close()
  if (completeEventId) void eventsStore.scheduleNext(completeEventId, days)
  flushPendingToast()
}

function onSheetDismiss(): void {
  nextTimeSheet.close()
  flushPendingToast()
}

function onToastAction(): void {
  toast.value?.action?.onAction()
  dismiss()
}
</script>

<template>
  <div class="log-screen">
    <template v-if="householdStore.household">
      <HouseholdBar
        :household="eventsStore.derived.week.household"
        :target="eventsStore.derived.week.target"
        :by-member="eventsStore.derived.week.byMember"
        :members="householdStore.members"
      />
      <p v-if="syncStore.outboxCount > 0" class="log-screen__sync-note">{{ syncStore.outboxCount }} waiting to sync</p>

      <p class="log-screen__you-today">You today: {{ eventsStore.youToday }} pts</p>

      <QuickRow
        :tasks="eventsStore.derived.quickRow"
        :done-today-by-task="doneTodayByTaskMembers"
        @complete="onQuickComplete"
      />

      <div class="log-screen__grid">
        <CategoryTile
          v-for="cat in GRID_CATEGORIES"
          :key="cat"
          :category="cat"
          :label="categoryLabel(cat)"
          :icon="categoryIcon(cat)"
          :done-today="doneTodayInCategory(cat)"
          :due-dot="eventsStore.derived.dueDots[cat]"
        />
      </div>
    </template>

    <EmptyState v-else :icon="PhListChecks" label="Log a task in two taps once tasks are loaded." />

    <Toast
      v-if="toast"
      :message="toast.message"
      :action-label="toast.action?.label"
      :expires-at="toast.expiresAt"
      @action="onToastAction"
      @expire="dismiss"
    />

    <NextTimeSheet
      v-if="nextTimeSheet.payload.value"
      v-bind="nextTimeSheet.payload.value"
      @schedule="onSheetSchedule"
      @dismiss="onSheetDismiss"
    />
  </div>
</template>

<style scoped>
.log-screen {
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
  padding: var(--gutter);
}

.log-screen__sync-note {
  margin: 0;
  color: var(--warn);
  font-size: var(--fs-sm);
}

.log-screen__you-today {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-lg);
}

.log-screen__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--list-gap);
}
</style>
