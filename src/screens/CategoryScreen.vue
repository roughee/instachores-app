<script setup lang="ts">
/**
 * Category (Plan §5.5, DESIGN.md §5): every active task in one category, as
 * a single list sorted by `sort`. A top-level task with a `comboBonus` or
 * with children renders as a `TaskGroup` card (chips + "Do all"); every
 * other active, non-child task renders as a plain `TaskButton`. Reuses the
 * same haptic-tick + toast-with-Undo wiring as LogScreen (issue #17):
 * `eventsStore.complete`/`completeMany` apply locally before their repo
 * writes resolve, so the list and its avatar dots update in the same frame.
 *
 * The "Next time?" sheet (issue #69) opens after a plain `TaskButton`
 * complete and after a group's "Do all" (with the parent task and the
 * summed points), but never after a `TaskGroup` sub-item chip tap -- that
 * still just logs and toasts, same as before. The toast is queued behind
 * an open sheet so its 4s Undo window starts on close, not on completion.
 *
 * `?demoComplete=<taskId>,<taskId>` (dev-only query flag, gated by
 * `usePwa.ts`'s `hasFlag`/`flagValue`, same pattern as `forceUpdateToast`):
 * on mount, completes each listed task id once, in order -- a repeated id
 * logs that task twice, which is how `scripts/screenshots.mjs` renders a
 * deterministic x2 badge without scripting real taps. `?demoSheet=<taskId>`
 * (issue #69) similarly completes one task through the normal `onComplete`
 * path so its Next time sheet opens, for a deterministic sheet screenshot.
 *
 * Away tasks (issue #70, Plan §5.5 "States"): a top-level task (plain or a
 * `TaskGroup`'s parent) whose `eventsStore.schedule` entry is `'away'`
 * leaves `visibleItems` and instead renders as one row in the "Scheduled"
 * fold below the list -- a group's away parent folds as a single row, its
 * children never explode into the fold. Tapping a fold row calls
 * `eventsStore.unschedule` (bring back early) and toasts, no Undo action.
 * A listed or due item's `TaskButton` gets its subline/Due chip from
 * `taskRowCopy` (`src/domain/scheduleCopy.ts`), keyed by task id.
 */
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PhCalendarBlank, PhTag } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import NextTimeSheet from '@/components/NextTimeSheet.vue'
import TaskButton from '@/components/TaskButton.vue'
import TaskGroup from '@/components/TaskGroup.vue'
import Toast from '@/components/Toast.vue'
import { categoryColor, categoryIcon, categoryLabel } from '@/components/categoryIcons'
import { useCelebration } from '@/composables/useCelebration'
import { flagValue, hasFlag } from '@/composables/usePwa'
import { useHaptic } from '@/composables/useHaptic'
import { useNextTimeSheet } from '@/composables/useNextTimeSheet'
import { useToast } from '@/composables/useToast'
import type { ShowToastOptions } from '@/composables/useToast'
import { scheduledBackLabel, taskRowCopy } from '@/domain/scheduleCopy'
import { Category } from '@/schemas'
import type { Member, Task } from '@/schemas'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { getSessionOptions } from '@/stores/sessionOptions'

const route = useRoute()
const catalogStore = useCatalogStore()
const eventsStore = useEventsStore()
const householdStore = useHouseholdStore()
const { tick } = useHaptic()
const { toast, show, dismiss } = useToast()
const { trigger: triggerCelebration } = useCelebration()
const nextTimeSheet = useNextTimeSheet()

const category = computed(() => {
  const raw = route.params.category
  return Category.safeParse(typeof raw === 'string' ? raw : '')
})

type ListItem =
  { kind: 'button'; task: Task; sort: number } | { kind: 'group'; parent: Task; children: Task[]; sort: number }

/** One flowing list, sorted the way the seed data orders a category: plain
 * tasks and group cards interleaved by `sort`, not grouped by kind. */
const items = computed<ListItem[]>(() => {
  if (!category.value.success) return []
  const active = (catalogStore.byCategory.get(category.value.data) ?? []).filter((t) => !t.archived)
  const topLevel = active.filter((t) => t.parentId === undefined)
  const out: ListItem[] = topLevel.map((t) => {
    const children = active.filter((c) => c.parentId === t.id)
    if (t.comboBonus !== undefined || children.length > 0) {
      return { kind: 'group', parent: t, children, sort: t.sort }
    }
    return { kind: 'button', task: t, sort: t.sort }
  })
  return out.sort((a, b) => a.sort - b.sort)
})

/** The top-level task an item's schedule state is checked against: the
 * task itself for a plain button, the parent for a group (issue #70). */
function scheduleTaskFor(item: ListItem): Task {
  return item.kind === 'button' ? item.task : item.parent
}

/** `items` minus any top-level task or group parent that is away (Plan
 * §5.5 "States"): those render in the Scheduled fold instead. */
const visibleItems = computed<ListItem[]>(() =>
  items.value.filter((item) => eventsStore.schedule.get(scheduleTaskFor(item).id)?.state !== 'away'),
)

interface AwayItem {
  task: Task
  dueAt: Date
}

/** One row per away top-level task or group parent, in list order -- a
 * group's children never appear here on their own (issue #70). */
const awayItems = computed<AwayItem[]>(() => {
  const out: AwayItem[] = []
  for (const item of items.value) {
    const task = scheduleTaskFor(item)
    const s = eventsStore.schedule.get(task.id)
    if (s?.state === 'away' && s.dueAt !== undefined) out.push({ task, dueAt: s.dueAt })
  }
  return out
})

/** `TaskButton`'s subline/Due chip for every plain button task (DESIGN.md's
 * TaskButton, `src/domain/scheduleCopy.ts`): empty for a group item, which
 * gets no chip/subline of its own. */
const taskRowCopyById = computed<Map<string, { subline?: string; due?: string }>>(() => {
  const map = new Map<string, { subline?: string; due?: string }>()
  const household = householdStore.household
  if (!household) return map
  const now = getSessionOptions().now()
  for (const item of items.value) {
    if (item.kind !== 'button') continue
    const s = eventsStore.schedule.get(item.task.id)
    if (s) map.set(item.task.id, taskRowCopy(s, household, now, household.tz))
  }
  return map
})

/** The Scheduled fold's "back <day>" for one away item. */
function backLabel(dueAt: Date): string {
  const household = householdStore.household
  if (!household) return ''
  return scheduledBackLabel(dueAt, getSessionOptions().now(), household.tz)
}

/** `eventsStore.doneTodayByTask` gives uids; `TaskButton` wants the
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

function showLoggedToast(message: string): void {
  const eventId = eventsStore.recentlyLogged?.eventId
  show({
    message,
    action: eventId ? { label: 'Undo', onAction: () => eventsStore.undo(eventId) } : undefined,
  })
}

/** Every task on this screen shares the route's category, so this is
 * cheaper than resolving each tapped task's own `category` field. */
function celebrationColor(): string {
  return categoryColor(category.value.success ? category.value.data : undefined)
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
 * `nextTimeSheet.open` itself skips kid tasks. `points`, when given,
 * overrides the event's own points -- a group "Do all"'s summed total
 * rather than the parent's own (usually 0). Returns whether it opened, so
 * the caller knows whether to defer its toast. */
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
    categoryLabel: categoryLabel(category.value.success ? category.value.data : task.category),
  })
  return nextTimeSheet.payload.value !== undefined
}

function toastOptionsFor(message: string, eventId: string | undefined): ShowToastOptions {
  return { message, action: eventId ? { label: 'Undo', onAction: () => eventsStore.undo(eventId) } : undefined }
}

/** A plain `TaskButton` complete (DESIGN.md §5 NextTimeSheet): opens the
 * sheet, unlike a `TaskGroup` sub-item tap (`onChildComplete` below). */
async function onComplete(taskId: string): Promise<void> {
  const task = catalogStore.byId.get(taskId)
  tick()
  const lastDoneAt = task ? eventsStore.schedule.get(taskId)?.lastDoneAt : undefined
  const pending = eventsStore.complete(taskId)
  triggerCelebration(celebrationColor())
  const eventId = eventsStore.recentlyLogged?.eventId
  const toastOptions = toastOptionsFor(task ? `${task.name} logged` : 'Task logged', eventId)
  if (openSheetFor(task, eventId, lastDoneAt)) pendingToast = toastOptions
  else show(toastOptions)
  await pending
}

/** A `TaskGroup` sub-item chip tap: logs and toasts, never opens the sheet
 * (Plan §5.5: "Do all" opens it for the parent, a lone chip does not). */
async function onChildComplete(taskId: string): Promise<void> {
  const task = catalogStore.byId.get(taskId)
  tick()
  const pending = eventsStore.complete(taskId)
  triggerCelebration(celebrationColor())
  showLoggedToast(task ? `${task.name} logged` : 'Task logged')
  await pending
}

/** "Do all" (DESIGN.md §5): opens the sheet for the parent, with the sum
 * of every sub-item's points plus the parent's combo bonus, if any -- not
 * the parent's own points (usually 0). Computed the same way `TaskGroup`'s
 * own "+N" hint is (`taskIds` are already its active children), rather
 * than read back off `eventsStore.events` right after `completeMany`:
 * `complete`'s own repo write re-notifies this store from the repo's
 * (not-yet-bonused) list before the bonus's own write lands, so a
 * synchronous read straight after `completeMany` can transiently miss it. */
async function onCompleteAll(taskIds: string[], parent: Task): Promise<void> {
  tick()
  const lastDoneAt = eventsStore.schedule.get(parent.id)?.lastDoneAt
  const loggedPoints =
    taskIds.reduce((sum, id) => sum + (catalogStore.byId.get(id)?.points ?? 0), 0) + (parent.comboBonus ?? 0)
  const pending = eventsStore.completeMany(taskIds)
  triggerCelebration(celebrationColor())
  const eventId = eventsStore.recentlyLogged?.eventId
  const toastOptions = toastOptionsFor(`${parent.name} logged`, eventId)
  if (openSheetFor(parent, eventId, lastDoneAt, loggedPoints)) pendingToast = toastOptions
  else show(toastOptions)
  await pending
}

function onSheetSchedule(days: number): void {
  const completeEventId = nextTimeSheet.payload.value?.completeEventId
  const taskId = nextTimeSheet.payload.value?.task.id
  nextTimeSheet.close()
  if (completeEventId) void eventsStore.scheduleNext(completeEventId, days, taskId)
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

/** Bring-back-early (Plan §5.5 "States"): unschedules the task and toasts,
 * no Undo action -- scheduling it again is one tap on its own TaskButton
 * once "Next time?" opens for it. */
async function onBringBack(task: Task): Promise<void> {
  tick()
  const pending = eventsStore.unschedule(task.id)
  show({ message: `${task.name} is back` })
  await pending
}

onMounted(async () => {
  if (hasFlag('demoComplete')) {
    const raw = flagValue('demoComplete') ?? ''
    const taskIds = raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    for (const taskId of taskIds) await eventsStore.complete(taskId)
  }
  const demoSheetTaskId = flagValue('demoSheet')
  if (demoSheetTaskId) {
    // A group parent goes through "Do all", the same path a real tap takes,
    // so the sheet shows the summed points rather than the parent's own 0.
    const parent = catalogStore.byId.get(demoSheetTaskId)
    const children = catalogStore.tasks.filter((t) => t.parentId === demoSheetTaskId && !t.archived)
    if (parent && children.length > 0) {
      await onCompleteAll(
        children.map((c) => c.id),
        parent,
      )
    } else await onComplete(demoSheetTaskId)
  }
})
</script>

<template>
  <div class="category-screen">
    <template v-if="category.success">
      <header class="category-screen__header" :class="`category-screen__header--${category.data}`">
        <span class="category-screen__header-icon">
          <component :is="categoryIcon(category.data)" :size="24" weight="regular" aria-hidden="true" />
        </span>
        <h1 class="category-screen__header-label">{{ categoryLabel(category.data) }}</h1>
      </header>

      <div v-if="visibleItems.length > 0" class="category-screen__list">
        <template v-for="item in visibleItems" :key="item.kind === 'button' ? item.task.id : item.parent.id">
          <TaskButton
            v-if="item.kind === 'button'"
            :task="item.task"
            :done-by="doneTodayByTaskMembers.get(item.task.id) ?? []"
            v-bind="taskRowCopyById.get(item.task.id) ?? {}"
            @complete="onComplete(item.task.id)"
          />
          <TaskGroup
            v-else
            :parent="item.parent"
            :children="item.children"
            :done-today-by-task="eventsStore.doneTodayByTask"
            @complete="onChildComplete"
            @complete-all="(taskIds) => onCompleteAll(taskIds, item.parent)"
          />
        </template>
      </div>

      <EmptyState
        v-else-if="items.length === 0"
        :icon="PhTag"
        :label="`No tasks in ${categoryLabel(category.data)} yet.`"
      >
        <RouterLink to="/log" class="category-screen__empty-action">Go to Log</RouterLink>
      </EmptyState>

      <section v-if="awayItems.length > 0" class="category-screen__scheduled">
        <h2 class="category-screen__scheduled-header">Scheduled</h2>
        <button
          v-for="item in awayItems"
          :key="item.task.id"
          type="button"
          class="category-screen__scheduled-row"
          data-test="scheduled-row"
          @click="onBringBack(item.task)"
        >
          <span class="category-screen__scheduled-icon">
            <component :is="categoryIcon(item.task.category)" :size="24" weight="regular" aria-hidden="true" />
          </span>
          <span class="category-screen__scheduled-name">{{ item.task.name }}</span>
          <span class="category-screen__scheduled-back">
            <PhCalendarBlank :size="16" weight="regular" aria-hidden="true" />
            {{ backLabel(item.dueAt) }}
          </span>
        </button>
        <p class="category-screen__scheduled-hint">Tap a scheduled task to bring it back early.</p>
      </section>
    </template>

    <EmptyState v-else :icon="PhTag" label="No such category.">
      <RouterLink to="/log" class="category-screen__empty-action">Go to Log</RouterLink>
    </EmptyState>

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
.category-screen {
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
  padding: var(--gutter);
}

.category-screen__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--primary-soft);
}

.category-screen__header-icon {
  display: inline-flex;
  width: var(--touch);
  height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--primary);
}

.category-screen__header-label {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-xl);
}

.category-screen__header--kitchen .category-screen__header-icon {
  color: var(--cat-kitchen);
}

.category-screen__header--laundry .category-screen__header-icon {
  color: var(--cat-laundry);
}

.category-screen__header--floors .category-screen__header-icon {
  color: var(--cat-floors);
}

.category-screen__header--bathroom .category-screen__header-icon {
  color: var(--cat-bathroom);
}

.category-screen__header--kids .category-screen__header-icon {
  color: var(--cat-kids);
}

.category-screen__header--home .category-screen__header-icon {
  color: var(--cat-home);
}

.category-screen__header--admin .category-screen__header-icon {
  color: var(--cat-admin);
}

.category-screen__header--car .category-screen__header-icon {
  color: var(--cat-car);
}

.category-screen__header--kitchen {
  background: var(--cat-kitchen-soft);
}

.category-screen__header--laundry {
  background: var(--cat-laundry-soft);
}

.category-screen__header--floors {
  background: var(--cat-floors-soft);
}

.category-screen__header--bathroom {
  background: var(--cat-bathroom-soft);
}

.category-screen__header--kids {
  background: var(--cat-kids-soft);
}

.category-screen__header--home {
  background: var(--cat-home-soft);
}

.category-screen__header--admin {
  background: var(--cat-admin-soft);
}

.category-screen__header--car {
  background: var(--cat-car-soft);
}

.category-screen__list {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
}

.category-screen__empty-action {
  display: inline-flex;
  min-height: var(--touch);
  align-items: center;
  padding: 0 var(--card-pad);
  border-radius: var(--radius-button);
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 600;
  text-decoration: none;
}

.category-screen__scheduled {
  display: flex;
  flex-direction: column;
}

.category-screen__scheduled-header {
  margin: 0;
  padding: var(--list-gap) 0;
  color: var(--text-2);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.category-screen__scheduled-row {
  display: flex;
  min-height: var(--touch);
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 4px var(--card-pad);
  border: none;
  border-radius: var(--radius-button);
  background: none;
  color: var(--text-2);
  text-align: left;
}

.category-screen__scheduled-icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  background: var(--surface-2);
  color: var(--text-2);
}

.category-screen__scheduled-name {
  flex: 1;
  overflow: hidden;
  min-width: 0;
  font-size: var(--fs-md);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.category-screen__scheduled-back {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-xs);
}

.category-screen__scheduled-hint {
  margin: 4px var(--card-pad) 0;
  color: var(--text-2);
  font-size: var(--fs-xs);
}
</style>
