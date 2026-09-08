/**
 * Household + members (issue #15, Architecture.md §2). Holds the parsed
 * `Household` from `watchHousehold` and exposes the roster split by role.
 * `currentMember` reads which member this phone is from the session store.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { HouseholdRepo, Unsubscribe } from '@/data/repo'
import type { Household as HouseholdT, Member as MemberT } from '@/schemas'
import { useSessionStore } from './session'

export const useHouseholdStore = defineStore('household', () => {
  const household = ref<HouseholdT | undefined>(undefined)

  let unsubscribe: Unsubscribe | undefined

  /** (Re)wires the watcher to `repo`, unsubscribing any previous one first. */
  function bind(repo: HouseholdRepo, householdId: string): void {
    unbind()
    unsubscribe = repo.watchHousehold(householdId, (h) => {
      household.value = h
    })
  }

  function unbind(): void {
    unsubscribe?.()
    unsubscribe = undefined
    household.value = undefined
  }

  const members = computed<MemberT[]>(() => (household.value ? Object.values(household.value.members) : []))
  const adults = computed<MemberT[]>(() => members.value.filter((m) => m.role === 'adult'))
  const kid = computed<MemberT | undefined>(() => members.value.find((m) => m.role === 'kid'))

  /** The member this phone is signed in as, per the session store. */
  const currentMember = computed<MemberT | undefined>(() => {
    const uid = useSessionStore().memberUid
    if (!uid || !household.value) return undefined
    return household.value.members[uid]
  })

  return { household, members, adults, kid, currentMember, bind, unbind }
})
