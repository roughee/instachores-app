import { describe, expect, it } from 'vitest'
import { Task } from '@/schemas'

const valid = {
  v: 1,
  id: 'task-1',
  name: 'Pots',
  category: 'kitchen',
  points: 2,
  freq: 'daily',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'ana',
}

describe('Task schema', () => {
  it('accepts a valid task and fills the defaults', () => {
    const t = Task.parse(valid)
    expect(t.forRole).toBe('adult')
    expect(t.archived).toBe(false)
    expect(t.sort).toBe(0)
    expect(t.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects points above 50', () => {
    expect(Task.safeParse({ ...valid, points: 51 }).success).toBe(false)
  })

  it('rejects a missing version', () => {
    const { v: _v, ...noVersion } = valid
    expect(Task.safeParse(noVersion).success).toBe(false)
  })

  it('rejects an empty name and an unknown category', () => {
    expect(Task.safeParse({ ...valid, name: '' }).success).toBe(false)
    expect(Task.safeParse({ ...valid, category: 'garage' }).success).toBe(false)
  })

  it('parses a sheet row: numbers as text, TRUE/FALSE booleans, empty optional cells', () => {
    const row = {
      v: '1',
      id: 'task-1',
      name: 'Toilet',
      category: 'bathroom',
      points: '4',
      freq: 'weekly',
      forRole: 'adult',
      parentId: '',
      comboBonus: '',
      archived: 'FALSE',
      sort: '3',
      updatedAt: '2026-09-01T00:00:00.000Z',
      updatedBy: 'ben',
    }
    const t = Task.parse(row)
    expect(t.points).toBe(4)
    expect(t.sort).toBe(3)
    expect(t.archived).toBe(false)
    expect(t.parentId).toBeUndefined()
    expect(t.comboBonus).toBeUndefined()
  })

  it('reads TRUE from a sheet as archived, and an empty cell as the default', () => {
    expect(Task.parse({ ...valid, archived: 'TRUE' }).archived).toBe(true)
    expect(Task.parse({ ...valid, archived: '' }).archived).toBe(false)
    expect(Task.parse({ ...valid, archived: null }).archived).toBe(false)
  })

  it('round-trips through JSON', () => {
    const t = Task.parse({ ...valid, parentId: 'task-0', comboBonus: 2 })
    expect(Task.parse(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })

  it('accepts an optional intervalDays between 1 and 365, coerced from a sheet cell', () => {
    expect(Task.parse({ ...valid, intervalDays: 7 }).intervalDays).toBe(7)
    expect(Task.parse({ ...valid, intervalDays: '7' }).intervalDays).toBe(7)
    expect(Task.parse({ ...valid, intervalDays: '' }).intervalDays).toBeUndefined()
    expect(Task.parse(valid).intervalDays).toBeUndefined()
  })

  it('rejects an intervalDays outside 1 to 365', () => {
    expect(Task.safeParse({ ...valid, intervalDays: 0 }).success).toBe(false)
    expect(Task.safeParse({ ...valid, intervalDays: 366 }).success).toBe(false)
  })
})
