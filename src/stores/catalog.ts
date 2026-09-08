/**
 * Task and reward catalog (issue #15, Architecture.md §2). Holds the parsed
 * lists from `watchTasks`/`watchRewards`. `updateTaskPoints` writes a new
 * `Task` through the repo; it never touches already-logged events, so
 * re-pricing a task cannot rewrite history (Plan §5.5 Settings).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { HouseholdRepo, Unsubscribe } from '@/data/repo'
import { Task } from '@/schemas'
import type { Category, Reward as RewardT, Task as TaskT } from '@/schemas'
import { getSessionOptions } from './sessionOptions'

export const useCatalogStore = defineStore('catalog', () => {
  const tasks = ref<TaskT[]>([])
  const rewards = ref<RewardT[]>([])

  let boundRepo: HouseholdRepo | undefined
  let boundHouseholdId: string | undefined
  let unsubTasks: Unsubscribe | undefined
  let unsubRewards: Unsubscribe | undefined

  function bind(repo: HouseholdRepo, householdId: string): void {
    unbind()
    boundRepo = repo
    boundHouseholdId = householdId
    unsubTasks = repo.watchTasks(householdId, (t) => {
      tasks.value = t
    })
    unsubRewards = repo.watchRewards(householdId, (r) => {
      rewards.value = r
    })
  }

  function unbind(): void {
    unsubTasks?.()
    unsubTasks = undefined
    unsubRewards?.()
    unsubRewards = undefined
    boundRepo = undefined
    boundHouseholdId = undefined
    tasks.value = []
    rewards.value = []
  }

  const byId = computed<Map<string, TaskT>>(() => new Map(tasks.value.map((t) => [t.id, t])))

  const byCategory = computed<Map<Category, TaskT[]>>(() => {
    const map = new Map<Category, TaskT[]>()
    for (const t of tasks.value) {
      const list = map.get(t.category)
      if (list) list.push(t)
      else map.set(t.category, [t])
    }
    return map
  })

  const active = computed<TaskT[]>(() => tasks.value.filter((t) => !t.archived))

  /** Re-prices a task. Builds a new `Task` row with `updatedAt = now()` and upserts it; leaves every logged event untouched. */
  async function updateTaskPoints(taskId: string, points: number, byUid: string): Promise<void> {
    if (!boundRepo || !boundHouseholdId) throw new Error('catalog.updateTaskPoints: no household connected')
    const current = byId.value.get(taskId)
    if (!current) throw new Error(`catalog.updateTaskPoints: unknown task ${taskId}`)
    const updated = Task.parse({ ...current, points, updatedAt: getSessionOptions().now(), updatedBy: byUid })
    tasks.value = tasks.value.map((t) => (t.id === taskId ? updated : t))
    await boundRepo.upsertTask(boundHouseholdId, updated)
  }

  return { tasks, rewards, byId, byCategory, active, bind, unbind, updateTaskPoints }
})
