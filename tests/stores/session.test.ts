import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RepoError } from '@/data/repo'
import { Session } from '@/schemas'
import type { SetupLink as SetupLinkT } from '@/schemas'
import { SESSION_STORAGE_KEY, configureSession, useSessionStore } from '@/stores/session'
import { useCatalogStore } from '@/stores/catalog'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'
import { useSyncStore } from '@/stores/sync'
import { ANA, BEN, HID, NOW, household } from '../helpers/fixtures'
import { FakeSheetsRepo, fakeStorage } from '../helpers/testRepo'

const LINK: SetupLinkT = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }

function unusedDemo(): never {
  throw new Error('createDemoRepo not used in this test')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('sessionStore.startDemo', () => {
  it('connects a demo repo, picks the first adult as member, and binds household/catalog/events/sync', async () => {
    const demoRepo = new FakeSheetsRepo([{ id: HID, household: household() }])
    configureSession({
      storage: fakeStorage(),
      createSheetsRepo: unusedDemo,
      createDemoRepo: () => demoRepo,
      now: () => NOW,
    })
    const session = useSessionStore()

    await session.startDemo(NOW)

    expect(session.mode).toBe('demo')
    expect(session.memberUid).toBe(ANA)
    expect(session.householdId).toBe(HID)
    expect(session.repo).toBe(demoRepo)
    expect(useHouseholdStore().household?.id).toBe(HID)
    expect(useCatalogStore().tasks).toEqual([])
    expect(useEventsStore().events).toEqual([])
    expect(useSyncStore().online).toBe(true)
  })

  it('does not touch storage: the demo never persists a session', async () => {
    const demoRepo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    configureSession({ storage, createSheetsRepo: unusedDemo, createDemoRepo: () => demoRepo, now: () => NOW })
    await useSessionStore().startDemo(NOW)
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('sessionStore.connect', () => {
  it('builds the SheetsRepo via the injected factory, binds the stores, persists the session and starts the poller', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo, now: () => NOW })
    const session = useSessionStore()

    await session.connect(LINK, BEN)

    expect(session.mode).toBe('sheets')
    expect(session.memberUid).toBe(BEN)
    expect(session.householdId).toBe(HID)
    expect(useHouseholdStore().household?.id).toBe(HID)
    expect(repo.start).toHaveBeenCalledTimes(1)

    const stored = Session.parse(JSON.parse(storage.getItem(SESSION_STORAGE_KEY)!))
    expect(stored).toEqual({ v: 1, link: LINK, householdId: HID, memberUid: BEN })
  })

  it('rejects a member uid that is not on the household', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    configureSession({ storage: fakeStorage(), createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    await expect(useSessionStore().connect(LINK, 'nobody')).rejects.toThrow()
  })

  it('propagates a connect() failure (such as a wrong secret) without storing anything', async () => {
    class FailingRepo extends FakeSheetsRepo {
      override async connect(): Promise<never> {
        throw new RepoError('unauthorized', 'bad secret')
      }
    }
    const repo = new FailingRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    await expect(useSessionStore().connect(LINK, ANA)).rejects.toBeInstanceOf(RepoError)
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('sessionStore.resume', () => {
  it('returns false and binds nothing when no session is stored', async () => {
    configureSession({ storage: fakeStorage(), createSheetsRepo: unusedDemo, createDemoRepo: unusedDemo })
    const existed = await useSessionStore().resume()
    expect(existed).toBe(false)
    expect(useSessionStore().mode).toBe('disconnected')
  })

  it('rebuilds the SheetsRepo from the stored session, inits it from the snapshot with no network, and starts the poller', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const stored = Session.parse({ v: 1, link: LINK, householdId: HID, memberUid: ANA })
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: JSON.stringify(stored) })
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })

    const existed = await useSessionStore().resume()

    expect(existed).toBe(true)
    expect(useSessionStore().mode).toBe('sheets')
    expect(useSessionStore().memberUid).toBe(ANA)
    expect(repo.init).toHaveBeenCalledTimes(1)
    expect(repo.start).toHaveBeenCalledTimes(1)
  })

  it('returns false for a corrupt stored session instead of throwing', async () => {
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: '{not json' })
    configureSession({ storage, createSheetsRepo: unusedDemo, createDemoRepo: unusedDemo })
    await expect(useSessionStore().resume()).resolves.toBe(false)
  })
})

describe('sessionStore.preview', () => {
  it('returns the household from the injected factory without binding or persisting anything', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const session = useSessionStore()

    const result = await session.preview(LINK)

    expect(result.id).toBe(HID)
    expect(Object.keys(result.members)).toEqual(expect.arrayContaining([ANA, BEN]))
    expect(session.mode).toBe('disconnected')
    expect(session.repo).toBeNull()
    expect(session.householdId).toBeNull()
    expect(useHouseholdStore().household).toBeUndefined()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('propagates a connect() failure, such as a wrong secret, without binding anything', async () => {
    class FailingRepo extends FakeSheetsRepo {
      override async connect(): Promise<never> {
        throw new RepoError('unauthorized', 'bad secret')
      }
    }
    const repo = new FailingRepo([{ id: HID, household: household() }])
    configureSession({ storage: fakeStorage(), createSheetsRepo: () => repo, createDemoRepo: unusedDemo })

    await expect(useSessionStore().preview(LINK)).rejects.toBeInstanceOf(RepoError)
    expect(useSessionStore().mode).toBe('disconnected')
    expect(useSessionStore().repo).toBeNull()
  })
})

describe('sessionStore.ready', () => {
  it('resolves once startDemo() settles too, not only resume() -- a deep link straight into demo mode (main.ts’s ?demo=1) never calls resume()', async () => {
    const demoRepo = new FakeSheetsRepo([{ id: HID, household: household() }])
    configureSession({
      storage: fakeStorage(),
      createSheetsRepo: unusedDemo,
      createDemoRepo: () => demoRepo,
      now: () => NOW,
    })
    const session = useSessionStore()
    await session.startDemo(NOW)
    await expect(session.ready).resolves.toBeUndefined()
  })

  it('resolves once resume() settles, even when nothing was stored', async () => {
    configureSession({ storage: fakeStorage(), createSheetsRepo: unusedDemo, createDemoRepo: unusedDemo })
    const session = useSessionStore()
    await session.resume()
    await expect(session.ready).resolves.toBeUndefined()
  })

  it('does not resolve until resume() finishes awaiting the repo, so the router guard never flashes Welcome', async () => {
    const order: string[] = []
    class SlowRepo extends FakeSheetsRepo {
      // `init` is an instance field on FakeSheetsRepo (a `vi.fn()` assigned in
      // its constructor), not a prototype method, so overriding it as a field
      // here -- not a method -- is what actually shadows it.
      override readonly init = vi.fn(async (): Promise<undefined> => {
        order.push('init-start')
        await Promise.resolve()
        order.push('init-end')
        return undefined
      })
    }
    const repo = new SlowRepo([{ id: HID, household: household() }])
    const stored = Session.parse({ v: 1, link: LINK, householdId: HID, memberUid: ANA })
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: JSON.stringify(stored) })
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const session = useSessionStore()

    void session.ready.then(() => order.push('ready'))

    await session.resume()
    await session.ready

    expect(order).toEqual(['init-start', 'init-end', 'ready'])
  })
})

describe('sessionStore.disconnect', () => {
  it('stops the poller, unbinds every store and clears the stored session', async () => {
    const repo = new FakeSheetsRepo([{ id: HID, household: household() }])
    const storage = fakeStorage()
    configureSession({ storage, createSheetsRepo: () => repo, createDemoRepo: unusedDemo })
    const session = useSessionStore()
    await session.connect(LINK, ANA)

    session.disconnect()

    expect(repo.stop).toHaveBeenCalledTimes(1)
    expect(session.mode).toBe('disconnected')
    expect(session.repo).toBeNull()
    expect(session.memberUid).toBeNull()
    expect(useHouseholdStore().household).toBeUndefined()
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('is safe to call when nothing is connected', () => {
    configureSession({ storage: fakeStorage(), createSheetsRepo: unusedDemo, createDemoRepo: unusedDemo })
    expect(() => useSessionStore().disconnect()).not.toThrow()
  })
})
