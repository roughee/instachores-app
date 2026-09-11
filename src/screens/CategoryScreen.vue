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
 * `?demoComplete=<taskId>,<taskId>` (dev-only query flag, gated by
 * `usePwa.ts`'s `hasFlag`/`flagValue`, same pattern as `forceUpdateToast`):
 * on mount, completes each listed task id once, in order -- a repeated id
 * logs that task twice, which is how `scripts/screenshots.mjs` renders a
 * deterministic x2 badge without scripting real taps.
 */
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { PhTag } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import TaskButton from '@/components/TaskButton.vue'
import TaskGroup from '@/components/TaskGroup.vue'
import Toast from '@/components/Toast.vue'
import { categoryColor, categoryIcon, categoryLabel } from '@/components/categoryIcons'
import { useCelebration } from '@/composables/useCelebration'
import { flagValue, hasFlag } from '@/composables/usePwa'
import { useHaptic } from '@/composables/useHaptic'
import { useToast } from '@/composables/useToast'
import { Category } from '@/schemas'
import type { Member, Task } from '@/schemas'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'

const route = useRoute()
const catalogStore = useCatalogStore()
const eventsStore = useEventsStore()
const householdStore = useHouseholdStore()
const { tick } = useHaptic()
const { toast, show, dismiss } = useToast()
const { trigger: triggerCelebration } = useCelebration()

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
  return category.value.success ? categoryColor(category.value.data) : 'var(--primary)'
}

async function onComplete(taskId: string): Promise<void> {
  const task = catalogStore.byId.get(taskId)
  tick()
  const pending = eventsStore.complete(taskId)
  triggerCelebration(celebrationColor())
  showLoggedToast(task ? `${task.name} logged` : 'Task logged')
  await pending
}

async function onCompleteAll(taskIds: string[], groupName: string): Promise<void> {
  tick()
  const pending = eventsStore.completeMany(taskIds)
  triggerCelebration(celebrationColor())
  showLoggedToast(`${groupName} logged`)
  await pending
}

function onToastAction(): void {
  toast.value?.action?.onAction()
  dismiss()
}

onMounted(async () => {
  if (!hasFlag('demoComplete')) return
  const raw = flagValue('demoComplete') ?? ''
  const taskIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  for (const taskId of taskIds) await eventsStore.complete(taskId)
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

      <div v-if="items.length > 0" class="category-screen__list">
        <template v-for="item in items" :key="item.kind === 'button' ? item.task.id : item.parent.id">
          <TaskButton
            v-if="item.kind === 'button'"
            :task="item.task"
            :done-by="doneTodayByTaskMembers.get(item.task.id) ?? []"
            @complete="onComplete(item.task.id)"
          />
          <TaskGroup
            v-else
            :parent="item.parent"
            :children="item.children"
            :done-today-by-task="eventsStore.doneTodayByTask"
            @complete="onComplete"
            @complete-all="(taskIds) => onCompleteAll(taskIds, item.parent.name)"
          />
        </template>
      </div>

      <EmptyState v-else :icon="PhTag" :label="`No tasks in ${categoryLabel(category.data)} yet.`">
        <RouterLink to="/log" class="category-screen__empty-action">Go to Log</RouterLink>
      </EmptyState>
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
</style>
