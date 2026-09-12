<script setup lang="ts">
/**
 * Schedule (Plan §5.5 `#/schedule`, issue #71): what is due, what is coming
 * up, and what was done in the last 7 days, across every category --
 * `src/domain/scheduleView.ts` does the grouping and copy, this screen only
 * lays the result out and wires taps.
 *
 * Tapping a row completes the task for the current member exactly like Log
 * and Category do -- a plain task through `eventsStore.complete`, a group
 * parent through `completeMany` of its active children, like Category's
 * "Do all" -- then opens `NextTimeSheet` with the toast queued until the
 * sheet closes. This duplicates `CategoryScreen.vue`'s own
 * `openSheetFor`/`pendingToast` pattern (already duplicated once, between
 * `LogScreen.vue` and `CategoryScreen.vue`, with no shared composable
 * between them yet) rather than extracting a third copy into one: that
 * refactor would need to touch both of those already-covered screens to
 * stay in sync, which is more risk than this ticket's scope calls for.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PhCalendarCheck } from '@phosphor-icons/vue'
import DayHeader from '@/components/DayHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import NextTimeSheet from '@/components/NextTimeSheet.vue'
import RecentDoneRow from '@/components/RecentDoneRow.vue'
import ScheduleRow from '@/components/ScheduleRow.vue'
import Toast from '@/components/Toast.vue'
import { categoryColor, categoryLabel } from '@/components/categoryIcons'
import { useCelebration } from '@/composables/useCelebration'
import { useHaptic } from '@/composables/useHaptic'
import { useNextTimeSheet } from '@/composables/useNextTimeSheet'
import { useToast } from '@/composables/useToast'
import type { ShowToastOptions } from '@/composables/useToast'
import { buildScheduleView } from '@/domain/scheduleView'
import type { ScheduleViewRow } from '@/domain/scheduleView'
import type { Task } from '@/schemas'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { getSessionOptions } from '@/stores/sessionOptions'

const router = useRouter()
const catalogStore = useCatalogStore()
const eventsStore = useEventsStore()
const householdStore = useHouseholdStore()
const { tick } = useHaptic()
const { toast, show, dismiss } = useToast()
const { trigger: triggerCelebration } = useCelebration()
const nextTimeSheet = useNextTimeSheet()

const view = computed(() => {
  const household = householdStore.household
  if (!household) return { groups: [], recent: [] }
  return buildScheduleView({
    schedule: eventsStore.schedule,
    events: eventsStore.events,
    tasks: catalogStore.tasks,
    household,
    now: getSessionOptions().now(),
  })
})

/** "Sat 12 Sep" (Plan §5.5): weekday short, day numeric, month short, in the
 * household zone, same three-part shape `NextTimeSheet.vue` uses for its
 * own due-day label. */
const headerDate = computed(() => {
  const tz = householdStore.household?.tz ?? 'UTC'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(getSessionOptions().now())
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
})

type FlatItem = { kind: 'header'; key: string; label: string } | { kind: 'row'; key: string; row: ScheduleViewRow }

/** Headers and rows flattened into one list (same shape as `TodayScreen`'s
 * own hour/row flattening), so the "Upcoming section"'s single flex column
 * (DESIGN.md's 8px `--list-gap`) does not need one nested wrapper per group. */
const flatUpcoming = computed<FlatItem[]>(() => {
  const out: FlatItem[] = []
  for (const group of view.value.groups) {
    out.push({ kind: 'header', key: `header-${group.key}`, label: group.label })
    for (const row of group.rows) out.push({ kind: 'row', key: row.taskId, row })
  }
  return out
})

const hasUpcoming = computed(() => view.value.groups.length > 0)
const hasRecent = computed(() => view.value.recent.length > 0)
const isEmpty = computed(() => !hasUpcoming.value && !hasRecent.value)

function memberName(uid: string): string {
  return householdStore.household?.members[uid]?.name ?? 'Someone'
}

function memberColor(uid: string): string {
  return householdStore.household?.members[uid]?.color ?? 'var(--text-2)'
}

function goToLog(): void {
  void router.push('/log')
}

/** Toast queued behind an open Next time sheet (same pattern as
 * `CategoryScreen.vue`'s own `pendingToast`): `show()` waits so the 4s Undo
 * window starts on the sheet's close, not on the completion itself. */
let pendingToast: ShowToastOptions | undefined

function flushPendingToast(): void {
  if (!pendingToast) return
  show(pendingToast)
  pendingToast = undefined
}

function toastOptionsFor(message: string, eventId: string | undefined): ShowToastOptions {
  return { message, action: eventId ? { label: 'Undo', onAction: () => eventsStore.undo(eventId) } : undefined }
}

/** Opens the Next time sheet for `task`'s just-created `complete` event, if
 * the household is loaded and the event is still live (same contract as
 * `CategoryScreen.vue`'s own `openSheetFor`). `points`, for a group row,
 * overrides the event's own points with the summed total the row itself
 * already carries. */
function openSheetFor(
  task: Task | undefined,
  eventId: string | undefined,
  lastDoneAt: Date | undefined,
  points?: number,
): boolean {
  const household = householdStore.household
  if (!task || !eventId || !household) return false
  const event = eventsStore.events.find((e) => e.id === eventId)
  if (!event || event.type !== 'complete') return false
  nextTimeSheet.open({
    task,
    completeEventId: eventId,
    points: points ?? event.points,
    memberName: householdStore.currentMember?.name ?? '',
    lastDoneAt,
    completedAt: event.at,
    tz: household.tz,
    categoryLabel: categoryLabel(task.category),
  })
  return nextTimeSheet.payload.value !== undefined
}

/** A row tap (Plan §5.5): a plain task completes through `complete`; a
 * group parent (active children, per the row's own category) completes
 * every active child through `completeMany`, like Category's "Do all" --
 * `row.points` is already their sum plus any combo bonus, so it is passed
 * straight through as the sheet's points instead of re-deriving it here. */
async function onRowComplete(row: ScheduleViewRow): Promise<void> {
  const task = catalogStore.byId.get(row.taskId)
  if (!task) return
  tick()
  const lastDoneAt = eventsStore.schedule.get(row.taskId)?.lastDoneAt
  const children = catalogStore.tasks.filter((t) => t.parentId === row.taskId && !t.archived)
  const isGroup = children.length > 0
  const pending = isGroup ? eventsStore.completeMany(children.map((c) => c.id)) : eventsStore.complete(task.id)
  triggerCelebration(categoryColor(task.category))
  const eventId = eventsStore.recentlyLogged?.eventId
  const toastOptions = toastOptionsFor(`${task.name} logged`, eventId)
  if (openSheetFor(task, eventId, lastDoneAt, isGroup ? row.points : undefined)) pendingToast = toastOptions
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
  <div class="schedule-screen">
    <header class="schedule-screen__header">
      <h1 class="schedule-screen__title">Schedule</h1>
      <span class="schedule-screen__date">{{ headerDate }}</span>
    </header>

    <EmptyState
      v-if="isEmpty"
      :icon="PhCalendarCheck"
      label="Nothing scheduled yet."
      action-label="Log a task"
      @action="goToLog"
    />

    <template v-else>
      <p v-if="!hasUpcoming" class="schedule-screen__hint">Nothing coming up. Log a task and pick its next time.</p>

      <div v-if="hasUpcoming" class="schedule-screen__upcoming">
        <template v-for="item in flatUpcoming" :key="item.key">
          <DayHeader v-if="item.kind === 'header'" :label="item.label" />
          <ScheduleRow v-else v-bind="item.row" @complete="onRowComplete(item.row)" />
        </template>
      </div>

      <section v-if="hasRecent" class="schedule-screen__recent">
        <DayHeader label="Recently done" />
        <RecentDoneRow
          v-for="row in view.recent"
          :key="row.key"
          :name="row.name"
          :member-name="memberName(row.forUid)"
          :member-color="memberColor(row.forUid)"
          :time-label="row.timeLabel"
          :back-label="row.backLabel"
        />
      </section>
    </template>

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
.schedule-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: var(--gutter);
}

.schedule-screen__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.schedule-screen__title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
}

.schedule-screen__date {
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.schedule-screen__hint {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.schedule-screen__upcoming {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schedule-screen__recent {
  display: flex;
  flex-direction: column;
  padding: 8px var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}
</style>
