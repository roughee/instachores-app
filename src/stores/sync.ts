/**
 * Sync status (issue #15, Architecture.md §6). Mirrors `repo.watchStatus`
 * for the status dot and the Sync panel (Plan §5.5 Settings), and exposes
 * `syncNow` for its "Sync now" button. `scriptVersion` is filled only for a
 * repo that answers the Apps Script `version` action (real `SheetsRepo`);
 * `MemoryRepo` has none, so it stays `undefined`.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HouseholdRepo, RepoStatus, SkippedRow, SyncResult, Unsubscribe } from '@/data/repo'
import { isVersionCapable } from './sessionOptions'

export const useSyncStore = defineStore('sync', () => {
  const online = ref(true)
  const outboxCount = ref(0)
  const lastPollAt = ref<Date | undefined>(undefined)
  const lastError = ref<string | undefined>(undefined)
  const skippedRows = ref(0)
  const lastSkipped = ref<SkippedRow | undefined>(undefined)
  const intervalMs = ref(0)
  const scriptVersion = ref<string | undefined>(undefined)

  let boundRepo: HouseholdRepo | undefined
  let unsubscribe: Unsubscribe | undefined

  function applyStatus(s: RepoStatus): void {
    online.value = s.online
    outboxCount.value = s.outboxCount
    lastPollAt.value = s.lastPollAt
    lastError.value = s.lastError
    skippedRows.value = s.skippedRows
    lastSkipped.value = s.lastSkipped
    intervalMs.value = s.intervalMs
  }

  function bind(repo: HouseholdRepo): void {
    unbind()
    boundRepo = repo
    unsubscribe = repo.watchStatus(applyStatus)
  }

  function unbind(): void {
    unsubscribe?.()
    unsubscribe = undefined
    boundRepo = undefined
    scriptVersion.value = undefined
  }

  /** Calls `repo.sync()` once. A no-op returning `undefined` when nothing is bound. */
  async function syncNow(): Promise<SyncResult | undefined> {
    if (!boundRepo) return undefined
    return boundRepo.sync()
  }

  /** Reads `scriptVersion` from a repo that exposes `version()`; leaves it `undefined` for one that does not (`MemoryRepo`). */
  async function refreshVersion(): Promise<void> {
    if (!boundRepo || !isVersionCapable(boundRepo)) {
      scriptVersion.value = undefined
      return
    }
    try {
      scriptVersion.value = await boundRepo.version()
    } catch {
      scriptVersion.value = undefined
    }
  }

  return {
    online,
    outboxCount,
    lastPollAt,
    lastError,
    skippedRows,
    lastSkipped,
    intervalMs,
    scriptVersion,
    bind,
    unbind,
    syncNow,
    refreshVersion,
  }
})
