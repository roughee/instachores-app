import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepo } from '@/data/memoryRepo'
import { configureSession, useSessionStore } from '@/stores/session'
import { useHouseholdStore } from '@/stores/household'
import { ANA, BEN, HID, MIA, household } from '../helpers/fixtures'
import { fakeStorage } from '../helpers/testRepo'

function fakeSheetsRepo(): never {
  throw new Error('not used in this test file')
}

beforeEach(() => {
  setActivePinia(createPinia())
  configureSession({ storage: fakeStorage(), createSheetsRepo: fakeSheetsRepo, createDemoRepo: fakeSheetsRepo })
})

describe('householdStore.bind', () => {
  it('receives the seeded household synchronously from watchHousehold', () => {
    const h = household()
    const repo = new MemoryRepo([{ id: HID, household: h }])
    const store = useHouseholdStore()
    store.bind(repo, HID)
    expect(store.household).toEqual(h)
  })

  it('members, adults and kid are read off the current household', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useHouseholdStore()
    store.bind(repo, HID)
    expect(store.members.map((m) => m.uid).sort()).toEqual([ANA, BEN, MIA])
    expect(store.adults.map((m) => m.uid).sort()).toEqual([ANA, BEN])
    expect(store.kid?.uid).toBe(MIA)
  })

  it('currentMember resolves the household member matching the session store', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useHouseholdStore()
    store.bind(repo, HID)
    const session = useSessionStore()
    session.memberUid = ANA
    expect(store.currentMember?.uid).toBe(ANA)
  })

  it('currentMember is undefined before a member is chosen', () => {
    const repo = new MemoryRepo([{ id: HID, household: household() }])
    const store = useHouseholdStore()
    store.bind(repo, HID)
    expect(store.currentMember).toBeUndefined()
  })

  it('unbind is safe to call before anything is bound', () => {
    const store = useHouseholdStore()
    expect(() => store.unbind()).not.toThrow()
  })

  it('re-binding to a new repo unsubscribes the previous watcher', () => {
    const repoA = new MemoryRepo([{ id: HID, household: household({ name: 'A' }) }])
    const repoB = new MemoryRepo([{ id: HID, household: household({ name: 'B' }) }])
    const store = useHouseholdStore()
    store.bind(repoA, HID)
    expect(store.household?.name).toBe('A')
    store.bind(repoB, HID)
    expect(store.household?.name).toBe('B')
  })
})
