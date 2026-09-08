/**
 * Exercises apps-script/Code.js's handlers against fakes for every Apps
 * Script global it touches (see fakeGas.ts and loadHomeCrew.ts), since Apps
 * Script itself cannot run in this environment. Every acceptance criterion
 * of issue #5 has a test here. The script's own `test_()` runs the same
 * scenarios against a real scratch spreadsheet before each deploy.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFakeContentService,
  createFakeDriveApp,
  createFakeLockService,
  createFakePropertiesService,
  createFakeSpreadsheetApp,
  FakeSpreadsheet,
} from './fakeGas'
import { loadHomeCrew, type HomeCrewNamespace } from './loadHomeCrew'

const SECRET = 'top-secret-household-key'

const MEMBERS_ROWS = [
  ['uid', 'name', 'color', 'role'],
  ['ana', 'Ana', '#1f8a70', 'adult'],
  ['ben', 'Ben', '#3f6fd4', 'adult'],
]

const TASKS_HEADERS = ['v', 'id', 'name', 'category', 'points', 'freq', 'forRole', 'parentId', 'comboBonus', 'archived', 'sort', 'updatedAt', 'updatedBy']
const REWARDS_HEADERS = ['v', 'id', 'name', 'cost', 'kind', 'commitment', 'archived', 'updatedAt', 'updatedBy']
const EVENTS_HEADERS = ['v', 'id', 'type', 'actorUid', 'at', 'loggedAt', 'note', 'taskId', 'forUid', 'points', 'refEventId', 'rewardId', 'cost', 'combo', 'day']

function makeWorld(opts: { tasks?: unknown[][]; rewards?: unknown[][]; events?: unknown[][]; tryLockSucceeds?: boolean } = {}) {
  const ss = new FakeSpreadsheet({
    household: [
      ['key', 'value'],
      ['v', 1],
      ['id', 'hh-test'],
      ['name', 'Home'],
      ['weeklyTarget', 250],
      ['tz', 'Europe/Vilnius'],
      ['createdAt', '2026-09-01T00:00:00.000Z'],
    ],
    members: MEMBERS_ROWS,
    tasks: opts.tasks ?? [TASKS_HEADERS],
    rewards: opts.rewards ?? [REWARDS_HEADERS],
    events: opts.events ?? [EVENTS_HEADERS],
  })
  const { LockService, state: lockState } = createFakeLockService(opts.tryLockSucceeds === undefined ? {} : { tryLockSucceeds: opts.tryLockSucceeds })
  const { PropertiesService } = createFakePropertiesService({ SECRET })
  const { ContentService } = createFakeContentService()
  const { SpreadsheetApp } = createFakeSpreadsheetApp(ss)
  const { DriveApp } = createFakeDriveApp()
  const HomeCrew = loadHomeCrew({ SpreadsheetApp, LockService, PropertiesService, ContentService, DriveApp })
  const ctx = HomeCrew.makeCtx(ss, LockService, PropertiesService)
  return { ss, HomeCrew, ctx, lockState }
}

function parseResult(output: { getContent(): string }): { ok: boolean; [k: string]: unknown } {
  return JSON.parse(output.getContent())
}

describe('secret check', () => {
  it('rejects a wrong secret without touching the sheet', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const before = ss.getSheetByName('events')!.snapshot()
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: 'nope', action: 'version' }))
    expect(res).toEqual({ ok: false, code: 'unauthorized' })
    expect(ss.getSheetByName('events')!.snapshot()).toEqual(before)
  })

  it('rejects a missing secret without touching the sheet', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const before = ss.getSheetByName('tasks')!.snapshot()
    const res = parseResult(HomeCrew.handleRequest(ctx, { action: 'tasks.upsert', task: { id: 't1' } }))
    expect(res).toEqual({ ok: false, code: 'unauthorized' })
    expect(ss.getSheetByName('tasks')!.snapshot()).toEqual(before)
  })

  it('accepts the right secret', () => {
    const { HomeCrew, ctx } = makeWorld()
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'version' }))
    expect(res.ok).toBe(true)
    expect(res.version).toBe(HomeCrew.VERSION)
  })
})

describe('events.append', () => {
  it('appends only the new event, stamps loggedAt, and reports appended and skipped', () => {
    const { HomeCrew, ctx, ss } = makeWorld({
      events: [EVENTS_HEADERS, ['1', 'existing-1', 'complete', 'ana', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '', 'pots', 'ana', '2', '', '', '', '', '']],
    })
    const events = [
      { v: 1, id: 'existing-1', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 },
      { v: 1, id: 'existing-1-dup-in-batch', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 },
      { v: 1, id: 'new-1', type: 'complete', actorUid: 'ben', at: '2026-09-08T10:05:00.000Z', taskId: 'counters', forUid: 'ben', points: 3 },
    ]
    // Make the first two collide: reuse the same id as the already-stored row plus one more pre-existing id.
    events[1]!.id = 'existing-1'
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'events.append', events }))
    expect(res.ok).toBe(true)
    expect(res.appended).toEqual(['new-1'])
    expect(res.skipped).toEqual(['existing-1', 'existing-1'])
    expect(typeof res.loggedAt).toBe('string')

    const rows = ss.getSheetByName('events')!.snapshot()
    // header + the original pre-seeded row + exactly one newly appended row
    expect(rows.length).toBe(3)
    const newRow = HomeCrew.rowToObject(EVENTS_HEADERS, rows[2] as unknown[])
    expect(newRow.id).toBe('new-1')
    expect(newRow.loggedAt).toBe(res.loggedAt)
  })

  it('rejects the whole batch when an event has no id', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const before = ss.getSheetByName('events')!.snapshot()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'events.append',
        events: [{ v: 1, id: '', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 }],
      }),
    )
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    expect(ss.getSheetByName('events')!.snapshot()).toEqual(before)
  })

  it('rejects the whole batch when points is out of range', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const before = ss.getSheetByName('events')!.snapshot()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'events.append',
        events: [{ v: 1, id: 'e1', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 51 }],
      }),
    )
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    expect(ss.getSheetByName('events')!.snapshot()).toEqual(before)
  })

  it('rejects the whole batch when actorUid is not a member', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const before = ss.getSheetByName('events')!.snapshot()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'events.append',
        events: [{ v: 1, id: 'e1', type: 'complete', actorUid: 'stranger', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 }],
      }),
    )
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    expect(ss.getSheetByName('events')!.snapshot()).toEqual(before)
  })

  it('answers locked and appends nothing when the lock cannot be acquired', () => {
    const { HomeCrew, ctx, ss, lockState } = makeWorld({ tryLockSucceeds: false })
    const before = ss.getSheetByName('events')!.snapshot()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'events.append',
        events: [{ v: 1, id: 'e1', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 }],
      }),
    )
    expect(res).toEqual({ ok: false, code: 'locked', message: expect.any(String) })
    expect(ss.getSheetByName('events')!.snapshot()).toEqual(before)
    expect(lockState.tryLockCalls).toBe(1)
  })

  it('releases the lock even when the write itself throws', () => {
    const { HomeCrew, ctx, ss, lockState } = makeWorld()
    const eventsSheet = ss.getSheetByName('events')!
    const originalGetRange = eventsSheet.getRange.bind(eventsSheet)
    eventsSheet.getRange = ((row: number, col: number, numRows?: number, numCols?: number) => {
      const range = originalGetRange(row, col, numRows, numCols)
      if (row > 1) {
        range.setValues = () => {
          throw new Error('simulated write failure')
        }
      }
      return range
    }) as typeof eventsSheet.getRange

    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'events.append',
        events: [{ v: 1, id: 'e1', type: 'complete', actorUid: 'ana', at: '2026-09-08T10:00:00.000Z', taskId: 'pots', forUid: 'ana', points: 2 }],
      }),
    )
    expect(res.ok).toBe(false)
    expect(lockState.tryLockCalls).toBe(1)
    expect(lockState.releaseCalls).toBe(1)
    expect(lockState.locked).toBe(false)
  })
})

describe('events.since', () => {
  function seededEvents() {
    return [
      EVENTS_HEADERS,
      ['1', 'e-old', 'complete', 'ana', '2026-09-08T09:00:00.000Z', '2026-09-08T09:00:00.000Z', '', 'pots', 'ana', '2', '', '', '', '', ''],
      ['1', 'e-boundary', 'complete', 'ana', '2026-09-08T09:59:59.500Z', '2026-09-08T09:59:59.500Z', '', 'pots', 'ana', '2', '', '', '', '', ''],
      ['1', 'e-new', 'complete', 'ben', '2026-09-08T10:00:05.000Z', '2026-09-08T10:00:05.000Z', '', 'counters', 'ben', '3', '', '', '', '', ''],
    ]
  }

  it('returns only rows with loggedAt after the cursor, plus serverTime', () => {
    const { HomeCrew, ctx } = makeWorld({ events: seededEvents() })
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'events.since', since: '2026-09-08T10:00:00.000Z' }))
    expect(res.ok).toBe(true)
    const ids = (res.events as { id: string }[]).map((e) => e.id)
    expect(ids).not.toContain('e-old')
    expect(ids).toContain('e-new')
    expect(typeof res.serverTime).toBe('string')
  })

  it('includes rows logged within one second before the cursor, to avoid a boundary miss', () => {
    const { HomeCrew, ctx } = makeWorld({ events: seededEvents() })
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'events.since', since: '2026-09-08T10:00:00.000Z' }))
    const ids = (res.events as { id: string }[]).map((e) => e.id)
    expect(ids).toContain('e-boundary')
  })
})

describe('tasks.upsert', () => {
  const existingRow = ['1', 'task-pots', 'Pots', 'kitchen', '2', 'daily', 'adult', '', '', 'FALSE', '0', '2026-09-01T00:00:00.000Z', 'ana']

  it('answers conflict and leaves the row unchanged when updatedAt is older than stored', () => {
    const { HomeCrew, ctx, ss } = makeWorld({ tasks: [TASKS_HEADERS, existingRow] })
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'tasks.upsert',
        task: {
          v: 1,
          id: 'task-pots',
          name: 'Pots (renamed)',
          category: 'kitchen',
          points: 5,
          freq: 'daily',
          forRole: 'adult',
          archived: false,
          sort: 0,
          updatedAt: '2026-08-01T00:00:00.000Z',
          updatedBy: 'ben',
        },
      }),
    )
    expect(res).toMatchObject({ ok: false, code: 'conflict' })
    const rows = ss.getSheetByName('tasks')!.snapshot()
    expect(rows[1]).toEqual(existingRow)
  })

  it('writes the row when updatedAt is newer than stored', () => {
    const { HomeCrew, ctx, ss } = makeWorld({ tasks: [TASKS_HEADERS, existingRow] })
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'tasks.upsert',
        task: {
          v: 1,
          id: 'task-pots',
          name: 'Pots (renamed)',
          category: 'kitchen',
          points: 5,
          freq: 'daily',
          forRole: 'adult',
          archived: false,
          sort: 0,
          updatedAt: '2026-09-05T00:00:00.000Z',
          updatedBy: 'ben',
        },
      }),
    )
    expect(res.ok).toBe(true)
    const rows = ss.getSheetByName('tasks')!.snapshot()
    const obj = HomeCrew.rowToObject(TASKS_HEADERS, rows[1] as unknown[])
    expect(obj.name).toBe('Pots (renamed)')
    expect(obj.points).toBe(5)
  })

  it('appends a new row when the task id does not exist yet', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'tasks.upsert',
        task: {
          v: 1,
          id: 'task-new',
          name: 'New task',
          category: 'kitchen',
          points: 1,
          freq: 'daily',
          forRole: 'adult',
          archived: false,
          sort: 0,
          updatedAt: '2026-09-05T00:00:00.000Z',
          updatedBy: 'ben',
        },
      }),
    )
    expect(res.ok).toBe(true)
    expect(ss.getSheetByName('tasks')!.snapshot().length).toBe(2)
  })
})

describe('rewards.upsert', () => {
  it('follows the same conflict rule as tasks.upsert', () => {
    const existingRow = ['1', 'reward-bath', 'Long bath', '15', 'solo', '', 'FALSE', '2026-09-01T00:00:00.000Z', 'ana']
    const { HomeCrew, ctx, ss } = makeWorld({ rewards: [REWARDS_HEADERS, existingRow] })
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'rewards.upsert',
        reward: { v: 1, id: 'reward-bath', name: 'Long bath', cost: 20, kind: 'solo', archived: false, updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'ben' },
      }),
    )
    expect(res).toMatchObject({ ok: false, code: 'conflict' })
    expect(ss.getSheetByName('rewards')!.snapshot()[1]).toEqual(existingRow)
  })
})

describe('seed', () => {
  it('fills empty tasks and rewards tabs', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'seed',
        tasks: [{ v: 1, id: 't1', name: 'Pots', category: 'kitchen', points: 2, freq: 'daily', forRole: 'adult', archived: false, sort: 0, updatedAt: '2026-09-01T00:00:00.000Z', updatedBy: 'ana' }],
        rewards: [{ v: 1, id: 'r1', name: 'Bath', cost: 15, kind: 'solo', archived: false, updatedAt: '2026-09-01T00:00:00.000Z', updatedBy: 'ana' }],
      }),
    )
    expect(res).toMatchObject({ ok: true, tasks: 1, rewards: 1 })
    expect(ss.getSheetByName('tasks')!.snapshot().length).toBe(2)
    expect(ss.getSheetByName('rewards')!.snapshot().length).toBe(2)
  })

  it('refuses when the tasks tab is not empty', () => {
    const { HomeCrew, ctx, ss } = makeWorld({ tasks: [TASKS_HEADERS, ['1', 't1', 'Pots', 'kitchen', '2', 'daily', 'adult', '', '', 'FALSE', '0', '2026-09-01T00:00:00.000Z', 'ana']] })
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'seed', tasks: [], rewards: [] }))
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
    expect(ss.getSheetByName('rewards')!.snapshot().length).toBe(1)
  })
})

describe('version', () => {
  it('returns a version string', () => {
    const { HomeCrew, ctx } = makeWorld()
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'version' }))
    expect(res).toEqual({ ok: true, version: HomeCrew.VERSION })
  })
})

describe('unknown action', () => {
  it('answers invalid', () => {
    const { HomeCrew, ctx } = makeWorld()
    const res = parseResult(HomeCrew.handleRequest(ctx, { secret: SECRET, action: 'nope' }))
    expect(res).toMatchObject({ ok: false, code: 'invalid' })
  })
})

describe('row mapping', () => {
  it('round-trips objects through headers, empty for undefined, TRUE/FALSE for booleans', () => {
    const { HomeCrew } = makeWorld()
    const headers = ['id', 'archived', 'note']
    const row = HomeCrew.objectToRow(headers, { id: 'x', archived: true, note: undefined })
    expect(row).toEqual(['x', 'TRUE', ''])
    const obj = HomeCrew.rowToObject(headers, ['x', 'TRUE', ''])
    expect(obj).toEqual({ id: 'x', archived: 'TRUE', note: '' })
  })

  it('writes Date values as ISO strings', () => {
    const { HomeCrew } = makeWorld()
    const row = HomeCrew.objectToRow(['at'], { at: new Date('2026-09-08T10:00:00.000Z') })
    expect(row).toEqual(['2026-09-08T10:00:00.000Z'])
  })
})

let hc: HomeCrewNamespace
beforeEach(() => {
  hc = makeWorld().HomeCrew
})

describe('module shape', () => {
  it('exposes the full action table', () => {
    expect(Object.keys(hc.ACTIONS).sort()).toEqual(
      ['bootstrap', 'events.append', 'events.since', 'household.update', 'rewards.upsert', 'seed', 'tasks.upsert', 'version'].sort(),
    )
  })
})

describe('sheet row bookkeeping', () => {
  const blankRow = TASKS_HEADERS.map(() => '')
  const pots = ['1', 'task-pots', 'Pots', 'kitchen', '2', 'daily', 'adult', '', '', 'FALSE', '0', '2026-09-01T00:00:00.000Z', 'ana']

  it('tasks.upsert writes back to the right sheet row when a blank row sits above the target', () => {
    const { HomeCrew, ctx, ss } = makeWorld({ tasks: [TASKS_HEADERS, blankRow, pots] })
    const res = parseResult(
      HomeCrew.handleRequest(ctx, {
        secret: SECRET,
        action: 'tasks.upsert',
        task: {
          v: 1,
          id: 'task-pots',
          name: 'Pots (renamed)',
          category: 'kitchen',
          points: 2,
          freq: 'daily',
          forRole: 'adult',
          archived: false,
          sort: 0,
          updatedAt: '2026-09-02T00:00:00.000Z',
          updatedBy: 'ben',
        },
      }),
    )
    expect(res.ok).toBe(true)
    const rows = ss.getSheetByName('tasks')!.snapshot()
    expect(rows[1]).toEqual(blankRow)
    expect(rows[2]![2]).toBe('Pots (renamed)')
  })

  it('events.append and upserts mark the rows they write as plain text', () => {
    const { HomeCrew, ctx, ss } = makeWorld()
    HomeCrew.handleRequest(ctx, {
      secret: SECRET,
      action: 'events.append',
      events: [{ v: 1, id: 'e1', type: 'complete', actorUid: 'ana', at: '2026-09-09T18:00:00.000Z', taskId: 'task-pots', forUid: 'ana', points: 2 }],
    })
    HomeCrew.handleRequest(ctx, {
      secret: SECRET,
      action: 'tasks.upsert',
      task: { v: 1, id: 'task-new', name: 'New', category: 'kitchen', points: 1, freq: 'daily', forRole: 'adult', archived: false, sort: 0, updatedAt: '2026-09-02T00:00:00.000Z', updatedBy: 'ana' },
    })
    expect(ss.getSheetByName('events')!.formats).toContainEqual(expect.objectContaining({ row: 2, format: '@' }))
    expect(ss.getSheetByName('tasks')!.formats).toContainEqual(expect.objectContaining({ row: 2, format: '@' }))
  })
})
